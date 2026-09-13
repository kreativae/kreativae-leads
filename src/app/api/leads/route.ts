import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { and, count, desc, eq, ilike, isNotNull, or, sql, type SQL } from "drizzle-orm";
import { LEAD_STATUSES } from "@/lib/constants";
import { requireUser } from "@/lib/auth";
import { toWhatsappDigits } from "@/lib/phone";
import { contactScore, normalizeWebsite } from "@/lib/osm";

export const dynamic = "force-dynamic";

const OPPORTUNITIES = ["no_website", "outdated", "modern", "unreviewed"];

function escapeLike(v: string): string {
  return v.replace(/[%_]/g, " ").trim();
}

export async function GET(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const sp = new URL(req.url).searchParams;
  const q = escapeLike(sp.get("q") ?? "");
  const segment = sp.get("segment") ?? "";
  const city = sp.get("city") ?? "";
  const status = sp.get("status") ?? "";
  const opportunity = sp.get("opportunity") ?? "";
  const onlyWhats = sp.get("whatsapp") === "1";
  const onlyInstagram = sp.get("instagram") === "1";
  const onlyHot = sp.get("hot") === "1";
  const sortParam = sp.get("sort");
  const sort =
    sortParam === "score" ? "score" : sortParam === "followers" ? "followers" : "recent";
  const limit = Math.max(1, Math.min(120, Number(sp.get("limit")) || 48));
  const offset = Math.max(0, Number(sp.get("offset")) || 0);

  const conds: SQL[] = [];
  if (q)
    conds.push(
      or(
        ilike(leads.companyName, `%${q}%`),
        ilike(leads.ownerName, `%${q}%`),
        ilike(leads.phone, `%${q}%`),
      ) as SQL,
    );
  if (segment) conds.push(eq(leads.segment, segment));
  if (city) conds.push(eq(leads.city, city));
  if (status && LEAD_STATUSES.some((s) => s.key === status))
    conds.push(eq(leads.status, status));
  if (opportunity && OPPORTUNITIES.includes(opportunity))
    conds.push(eq(leads.opportunity, opportunity));
  if (onlyWhats) conds.push(isNotNull(leads.whatsapp));
  if (onlyInstagram) conds.push(isNotNull(leads.instagram));
  // "Quente" = da para abordar agora (tem telefone) e tem argumento de venda
  // (nao tem site, ou tem um site que a analise reprovou).
  if (onlyHot) {
    conds.push(
      or(isNotNull(leads.whatsapp), isNotNull(leads.phone)) as SQL,
      or(
        eq(leads.opportunity, "no_website"),
        eq(leads.opportunity, "outdated"),
      ) as SQL,
    );
  }

  const where = conds.length ? and(...conds) : undefined;

  const [rows, totalRows, instagramRows, segmentFacets, cityFacets] =
    await Promise.all([
    db
      .select()
      .from(leads)
      .where(where)
      .orderBy(
        ...(sort === "score"
          ? [desc(leads.contactScore), desc(leads.createdAt)]
          : sort === "followers"
            ? [sql`${leads.igFollowers} desc nulls last`, desc(leads.createdAt)]
            : [desc(leads.createdAt)]),
      )
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(leads).where(where),
    // Quantos dos leads filtrados ja tem handle do Instagram capturado.
    db
      .select({ value: count() })
      .from(leads)
      .where(
        where
          ? and(where, isNotNull(leads.instagram))
          : isNotNull(leads.instagram),
      ),
    db.selectDistinct({ value: leads.segment }).from(leads),
    db.selectDistinct({ value: leads.city }).from(leads),
  ]);

  return NextResponse.json({
    leads: rows,
    total: totalRows[0]?.value ?? 0,
    withInstagram: instagramRows[0]?.value ?? 0,
    segments: segmentFacets.map((r) => r.value).filter(Boolean).sort(),
    cities: cityFacets.map((r) => r.value).filter(Boolean).sort(),
  });
}

function texto(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/** Cadastro manual — mesma tabela dos leads que vem de busca, só sem osmId real. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const companyName = texto(body.companyName, 200);
  const segment = texto(body.segment, 80);
  if (!companyName || !segment)
    return NextResponse.json(
      { ok: false, error: "Nome da empresa e segmento são obrigatórios." },
      { status: 400 },
    );

  const country = body.country === "PT" ? "PT" : "BR";
  const city = texto(body.city, 120);
  const state = texto(body.state, 80);
  const address = texto(body.address, 200);
  const ownerName = texto(body.ownerName, 120);
  const phone = texto(body.phone, 40);
  const notes = texto(body.notes, 4000);

  const email = texto(body.email, 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
    return NextResponse.json({ ok: false, error: "E-mail inválido." }, { status: 400 });

  const websiteRaw = texto(body.website, 300);
  const website = websiteRaw ? normalizeWebsite(websiteRaw) : null;
  if (websiteRaw && !website)
    return NextResponse.json({ ok: false, error: "Site inválido." }, { status: 400 });

  const whatsRaw = texto(body.whatsapp, 40);
  const whatsapp = whatsRaw ? toWhatsappDigits(whatsRaw, country) : null;
  if (whatsRaw && !whatsapp)
    return NextResponse.json(
      { ok: false, error: "Número de WhatsApp inválido." },
      { status: 400 },
    );

  // Nunca existiu no OSM/Places — precisa de um id unico proprio pra
  // satisfazer a mesma constraint que os leads de busca usam.
  const osmId = `manual:${randomUUID()}`;

  const score = contactScore({
    osmId,
    companyName,
    ownerName,
    phone,
    phoneAlt: null,
    whatsapp,
    whatsappSource: whatsapp ? "manual" : null,
    email,
    website,
    address,
    city,
    neighborhood: null,
    postcode: null,
    lat: null,
    lon: null,
    instagram: null,
    facebook: null,
    linkedin: null,
    openingHours: null,
    categoryRaw: null,
    rating: null,
    reviewsCount: null,
    priceLevel: null,
    googleMapsUri: null,
    extra: null,
  });

  const [created] = await db
    .insert(leads)
    .values({
      osmId,
      companyName,
      ownerName,
      segment,
      city,
      state,
      country,
      address,
      phone,
      whatsapp,
      whatsappSource: whatsapp ? "manual" : null,
      email,
      website,
      contactScore: score,
      opportunity: website ? "unreviewed" : "no_website",
      notes,
    })
    .returning();

  return NextResponse.json({ ok: true, lead: created });
}
