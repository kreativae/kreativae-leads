import { NextResponse } from "next/server";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { enrichFromWebsite } from "@/lib/enrich";
import { contactScore } from "@/lib/osm";
import { formatPhone } from "@/lib/phone";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!lead)
    return NextResponse.json({ ok: false, error: "Lead não encontrado." }, { status: 404 });
  if (!lead.website)
    return NextResponse.json(
      {
        ok: false,
        error:
          "Sem site para varrer. Leads sem site já são a maior oportunidade — use o WhatsApp/telefone.",
      },
      { status: 400 },
    );

  const result = await enrichFromWebsite(lead.website, lead.country);

  if (result.pagesScanned.length === 0)
    return NextResponse.json(
      { ok: false, error: "Não foi possível acessar o site para extrair dados." },
      { status: 502 },
    );

  const newWhatsapp = lead.whatsapp ?? result.whatsapps[0] ?? null;
  // Link wa.me no site do lead e declaracao explicita: vale ate para fixo,
  // e sobrepoe um "inferred" que tenha vindo do formato do telefone.
  const newWhatsappSource =
    result.whatsappDeclared && result.whatsapps[0]
      ? "declared"
      : (lead.whatsappSource ?? (newWhatsapp ? "inferred" : null));
  const newPhone =
    lead.phone ??
    (result.phones[0] ? result.phones[0] : null) ??
    (newWhatsapp ? formatPhone(newWhatsapp, lead.country) : null);

  const extra = {
    ...((lead.extra as Record<string, unknown> | null) ?? {}),
    ...(result.taxId ? { taxId: result.taxId } : {}),
    ...(result.emails.length > 1 ? { emailsAlt: result.emails.slice(1) } : {}),
    ...(result.whatsapps.length > 1 ? { whatsappAlt: result.whatsapps.slice(1) } : {}),
    enrichPages: result.pagesScanned,
  };

  const merged = {
    ownerName: lead.ownerName ?? result.ownerName,
    email: lead.email ?? result.emails[0] ?? null,
    phone: newPhone,
    phoneAlt: lead.phoneAlt ?? result.phones[1] ?? null,
    whatsapp: newWhatsapp,
    whatsappSource: newWhatsappSource,
    instagram: lead.instagram ?? result.instagram,
    facebook: lead.facebook ?? result.facebook,
    linkedin: lead.linkedin ?? result.linkedin,
  };

  const score = contactScore({
    osmId: lead.osmId,
    companyName: lead.companyName,
    ownerName: merged.ownerName,
    phone: merged.phone,
    phoneAlt: merged.phoneAlt,
    whatsapp: merged.whatsapp,
    whatsappSource: merged.whatsappSource,
    email: merged.email,
    website: lead.website,
    address: lead.address,
    city: lead.city,
    neighborhood: lead.neighborhood,
    postcode: lead.postcode,
    lat: lead.lat,
    lon: lead.lon,
    instagram: merged.instagram,
    facebook: merged.facebook,
    linkedin: merged.linkedin,
    openingHours: lead.openingHours,
    categoryRaw: lead.categoryRaw,
    rating: lead.rating,
    reviewsCount: lead.reviewsCount,
    priceLevel: lead.priceLevel,
    googleMapsUri: lead.googleMapsUri,
    extra: null,
  });

  const [updated] = await db
    .update(leads)
    .set({
      ...merged,
      extra,
      contactScore: score,
      enrichedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(leads.id, id))
    .returning();

  const found =
    (result.emails.length ? 1 : 0) +
    (result.whatsapps.length ? 1 : 0) +
    (result.ownerName ? 1 : 0) +
    (result.instagram || result.facebook || result.linkedin ? 1 : 0);

  return NextResponse.json({ ok: true, lead: updated, result, foundCount: found });
}
