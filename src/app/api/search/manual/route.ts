import { NextResponse } from "next/server";
import { db } from "@/db";
import { leads, searches, type Lead } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { matchSegment } from "@/lib/constants";
import { contactScore, normalizeWebsite, type NormalizedLead } from "@/lib/osm";
import { searchPlaces } from "@/lib/places";
import { registrarRequisicoesPlaces } from "@/lib/places-cost";
import { getEffectiveSetting } from "@/lib/settings-db";
import { requireUser } from "@/lib/auth";
import { logEvent } from "@/lib/system-log";
import { toWhatsappDigits } from "@/lib/phone";
import type { SiteAnalysis } from "@/lib/site-analyzer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Todo lead achado por aqui vira uma busca com este mesmo rótulo — é assim
 * que o quadro do CRM (agrupa por segment+city da busca) junta tudo numa
 * única "pesquisa" chamada Manual, não importa o segmento real do negócio.
 */
const SEGMENT_BUSCA_MANUAL = "Busca manual";
const CITY_BUSCA_MANUAL = "Manual";

/** Busca por nome — não grava nada, só devolve candidatos pro usuário escolher. */
export async function GET(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const sp = new URL(req.url).searchParams;
  const query = (sp.get("q") ?? "").trim();
  const city = (sp.get("city") ?? "").trim();
  const country = sp.get("country") === "PT" ? "PT" : "BR";

  if (query.length < 2)
    return NextResponse.json(
      { ok: false, error: "Digite ao menos 2 letras do nome." },
      { status: 400 },
    );

  const placesKey = await getEffectiveSetting("google_places_key", "GOOGLE_PLACES_API_KEY");
  if (!placesKey)
    return NextResponse.json(
      {
        ok: false,
        error:
          "Busca unitária precisa do Google Places configurado — adicione a chave em Configurações.",
      },
      { status: 400 },
    );

  let resultado: { leads: NormalizedLead[]; requisicoes: number };
  try {
    resultado = await searchPlaces({
      textQuery: city ? `${query} em ${city}` : query,
      apiKey: placesKey,
      limit: 8,
      country,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Erro ao consultar o Google Places." },
      { status: 502 },
    );
  }
  await registrarRequisicoesPlaces(resultado.requisicoes);

  const existentes = new Map<string, string>();
  if (resultado.leads.length > 0) {
    const rows = await db
      .select({ osmId: leads.osmId, id: leads.id })
      .from(leads)
      .where(inArray(leads.osmId, resultado.leads.map((l) => l.osmId)));
    for (const r of rows) existentes.set(r.osmId, r.id);
  }

  return NextResponse.json({
    ok: true,
    candidates: resultado.leads.map((l) => ({
      ...l,
      existingLeadId: existentes.get(l.osmId) ?? null,
    })),
  });
}

interface Overrides {
  companyName?: string;
  ownerName?: string;
  segment?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  instagram?: string;
  facebook?: string;
  linkedin?: string;
  notes?: string;
}

interface EnrichExtra {
  taxId?: string | null;
  emailsAlt?: string[];
  whatsappAlt?: string[];
  enrichPages?: string[];
}

interface IgProfileInput {
  handle: string;
  followersCount: number | null;
  mediaCount: number | null;
  biography: string | null;
}

interface AddBody {
  candidate?: NormalizedLead;
  country?: unknown;
  overrides?: Overrides;
  analysis?: SiteAnalysis;
  enrichExtra?: EnrichExtra;
  igProfile?: IgProfileInput;
}

/** Adiciona UM candidato já achado (devolvido pelo GET acima) aos Leads e ao CRM. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  let body: AddBody;
  try {
    body = (await req.json()) as AddBody;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const c = body.candidate;
  if (!c || typeof c.osmId !== "string" || typeof c.companyName !== "string" || !c.companyName.trim())
    return NextResponse.json({ ok: false, error: "Candidato inválido." }, { status: 400 });
  const country = body.country === "PT" ? "PT" : "BR";
  const o = body.overrides ?? {};

  // Campos "personalizados" antes de adicionar: só sobrescreve quando o
  // usuário de fato editou (texto não-vazio); senão fica o que o Google achou.
  const companyName = o.companyName?.trim() || c.companyName;
  const ownerName = o.ownerName?.trim() || c.ownerName;
  const phone = o.phone?.trim() || c.phone;
  const whatsapp = o.whatsapp?.trim() ? toWhatsappDigits(o.whatsapp.trim(), country) : c.whatsapp;
  const emailEditado = o.email?.trim();
  if (emailEditado && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailEditado))
    return NextResponse.json({ ok: false, error: "E-mail inválido." }, { status: 400 });
  const email = emailEditado || c.email;
  const website = o.website?.trim() ? normalizeWebsite(o.website.trim()) : c.website;
  const instagram = o.instagram?.trim() || c.instagram;
  const facebook = o.facebook?.trim() || c.facebook;
  const linkedin = o.linkedin?.trim() || c.linkedin;
  const notes = o.notes?.trim() || null;

  const matched = matchSegment(o.segment?.trim() || c.categoryRaw?.trim() || "Contato manual");
  const startedAt = Date.now();

  const [search] = await db
    .insert(searches)
    .values({
      segment: SEGMENT_BUSCA_MANUAL,
      city: CITY_BUSCA_MANUAL,
      country,
      source: "places",
      mode: "city",
      status: "running",
    })
    .returning();

  const mergedForScore: NormalizedLead = {
    ...c,
    companyName,
    ownerName,
    phone,
    whatsapp,
    email,
    website,
    instagram,
    facebook,
    linkedin,
  };
  const analysis = body.analysis;
  const opportunity = analysis
    ? analysis.grade === "modern"
      ? "modern"
      : "outdated"
    : website
      ? "unreviewed"
      : "no_website";
  const ex = body.enrichExtra;
  const extra = {
    ...(c.extra ?? {}),
    ...(ex?.taxId ? { taxId: ex.taxId } : {}),
    ...(ex?.emailsAlt?.length ? { emailsAlt: ex.emailsAlt } : {}),
    ...(ex?.whatsappAlt?.length ? { whatsappAlt: ex.whatsappAlt } : {}),
    ...(ex?.enrichPages?.length ? { enrichPages: ex.enrichPages } : {}),
  };

  const [inserted] = (await db
    .insert(leads)
    .values({
      searchId: search.id,
      osmId: c.osmId,
      companyName,
      ownerName,
      segment: matched.displayLabel,
      city: c.city,
      state: null,
      country,
      address: c.address,
      neighborhood: c.neighborhood,
      postcode: c.postcode,
      lat: c.lat,
      lon: c.lon,
      phone,
      phoneAlt: c.phoneAlt,
      whatsapp,
      whatsappSource: c.whatsappSource,
      email,
      website,
      instagram,
      facebook,
      linkedin,
      openingHours: c.openingHours,
      rating: c.rating,
      reviewsCount: c.reviewsCount,
      priceLevel: c.priceLevel,
      googleMapsUri: c.googleMapsUri,
      categoryRaw: c.categoryRaw,
      extra,
      notes,
      contactScore: contactScore(mergedForScore),
      opportunity,
      websiteScore: analysis?.score ?? null,
      websiteGrade: analysis?.grade ?? null,
      websiteChecks: analysis?.checks ?? null,
      analyzedAt: analysis ? new Date() : null,
      ...(body.igProfile
        ? {
            igUsername: body.igProfile.handle,
            igFollowers: body.igProfile.followersCount,
            igMediaCount: body.igProfile.mediaCount,
            igBiography: body.igProfile.biography?.slice(0, 1000) ?? null,
            igCheckedAt: new Date(),
          }
        : {}),
    })
    .onConflictDoUpdate({
      target: leads.osmId,
      set: { searchId: search.id, updatedAt: new Date() },
    })
    .returning()) as Lead[];

  await db
    .update(searches)
    .set({
      status: "done",
      resultsCount: 1,
      newCount: 1,
      withPhoneCount: inserted.phone ? 1 : 0,
      withWhatsappCount: inserted.whatsapp ? 1 : 0,
      noWebsiteCount: inserted.website ? 0 : 1,
      durationMs: Date.now() - startedAt,
    })
    .where(eq(searches.id, search.id));

  await logEvent({
    source: "search",
    status: "ok",
    message: `Busca manual: ${inserted.companyName}`,
    leadId: inserted.id,
  });

  return NextResponse.json({ ok: true, lead: inserted });
}
