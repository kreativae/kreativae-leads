import { NextResponse } from "next/server";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { extractAdInfo } from "@/lib/ad-vision";
import { igHandle, lookupIgProfile } from "@/lib/instagram";
import { getIgConfig } from "@/lib/settings-db";
import { normalizeWebsite } from "@/lib/osm";
import { analyzeWebsite } from "@/lib/site-analyzer";
import { enrichFromWebsite } from "@/lib/enrich";
import { toWhatsappDigits } from "@/lib/phone";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Varredura completa a partir do print de um anúncio: a visão do Claude
 * identifica o anunciante, e daí reaproveitamos o mesmo pipeline do
 * Buscador (Instagram Business Discovery + análise/enriquecimento do site)
 * para devolver um candidato já pronto pra revisão — sem gravar nada ainda.
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  let body: { imageUrl?: unknown };
  try {
    body = (await req.json()) as { imageUrl?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  if (!imageUrl)
    return NextResponse.json({ ok: false, error: "Informe a imagem do anúncio." }, { status: 400 });

  let extraction;
  try {
    extraction = await extractAdInfo(imageUrl);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Falha ao analisar a imagem." },
      { status: 502 },
    );
  }

  const country = extraction.country;
  const handle = igHandle(extraction.instagramHandle);

  let instagram: string | null = null;
  let instagramFollowers: number | null = null;
  let instagramMediaCount: number | null = null;
  let instagramBio: string | null = null;
  let igWebsite: string | null = null;
  let existingLeadId: string | null = null;

  if (handle) {
    const config = await getIgConfig();
    if (config) {
      const result = await lookupIgProfile({ ...config, handle });
      if (result.ok) {
        instagram = `https://instagram.com/${result.profile.username}`;
        instagramFollowers = result.profile.followersCount;
        instagramMediaCount = result.profile.mediaCount;
        instagramBio = result.profile.biography;
        igWebsite = result.profile.website;
      }
    }
    const [existing] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.osmId, `ig:${handle}`))
      .limit(1);
    existingLeadId = existing?.id ?? null;
  }

  const website = normalizeWebsite(extraction.website) ?? normalizeWebsite(igWebsite);

  let websiteAnalysis = null;
  let enrichExtra: {
    ownerName: string | null;
    emailsAlt: string[];
    whatsappAlt: string[];
    taxId: string | null;
    email: string | null;
    phone: string | null;
  } | null = null;

  if (website) {
    const [analysis, enrich] = await Promise.all([
      analyzeWebsite(website).catch(() => null),
      enrichFromWebsite(website, country).catch(() => null),
    ]);
    websiteAnalysis = analysis;
    if (enrich) {
      enrichExtra = {
        ownerName: enrich.ownerName,
        emailsAlt: enrich.emails,
        whatsappAlt: enrich.whatsapps,
        taxId: enrich.taxId,
        email: enrich.emails[0] ?? null,
        phone: enrich.phones[0] ?? null,
      };
    }
  }

  const phone = extraction.phone?.trim() || enrichExtra?.phone || null;
  const whatsapp = phone ? toWhatsappDigits(phone, country) : null;

  return NextResponse.json({
    ok: true,
    candidate: {
      osmId: `ia_${crypto.randomUUID()}`,
      companyName: extraction.companyName,
      ownerName: extraction.ownerName || enrichExtra?.ownerName || null,
      phone,
      whatsapp,
      email: extraction.email?.trim() || enrichExtra?.email || null,
      website,
      address: null,
      city: null,
      categoryRaw: extraction.segment,
      rating: null,
      reviewsCount: null,
      googleMapsUri: null,
      instagram,
      facebook: null,
      linkedin: null,
      instagramHandle: handle,
      instagramFollowers,
      instagramMediaCount,
      instagramBio,
      existingLeadId,
      country,
      adSummary: extraction.adSummary,
      confidence: extraction.confidence,
      analysis: websiteAnalysis,
      enrichExtra: enrichExtra
        ? {
            taxId: enrichExtra.taxId,
            emailsAlt: enrichExtra.emailsAlt,
            whatsappAlt: enrichExtra.whatsappAlt,
          }
        : null,
    },
  });
}
