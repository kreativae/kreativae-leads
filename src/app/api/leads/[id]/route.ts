import { NextResponse } from "next/server";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { LEAD_STATUSES } from "@/lib/constants";
import { toWhatsappDigits } from "@/lib/phone";
import { contactScore } from "@/lib/osm";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Busca um lead so — usado quando o dashboard linka direto para ele. */
export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!lead)
    return NextResponse.json({ ok: false, error: "Lead não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true, lead });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  let body: {
    status?: unknown;
    notes?: unknown;
    phone?: unknown;
    whatsapp?: unknown;
    email?: unknown;
    ownerName?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const [atual] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!atual)
    return NextResponse.json({ ok: false, error: "Lead não encontrado." }, { status: 404 });

  const patch: {
    status?: string;
    notes?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    whatsappSource?: string | null;
    email?: string | null;
    ownerName?: string | null;
    contactScore?: number;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  const texto = (v: unknown, max: number): string | null | undefined => {
    if (v === null) return null;
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    return t ? t.slice(0, max) : null;
  };
  if (typeof body.status === "string") {
    if (!LEAD_STATUSES.some((s) => s.key === body.status))
      return NextResponse.json(
        { ok: false, error: "Status inválido." },
        { status: 400 },
      );
    patch.status = body.status;
  }
  if (typeof body.notes === "string" || body.notes === null) {
    patch.notes = typeof body.notes === "string" ? body.notes.slice(0, 4000) : null;
  }

  const phone = texto(body.phone, 40);
  if (phone !== undefined) patch.phone = phone;

  const owner = texto(body.ownerName, 120);
  if (owner !== undefined) patch.ownerName = owner;

  const email = texto(body.email, 160);
  if (email !== undefined) {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
      return NextResponse.json({ ok: false, error: "E-mail inválido." }, { status: 400 });
    patch.email = email;
  }

  const whats = texto(body.whatsapp, 40);
  if (whats !== undefined) {
    // Numero informado a mao vale mesmo sendo fixo: quem digitou viu de onde
    // tirou. Por isso toWhatsappDigits, que nao exige formato de celular.
    const digitos = whats ? toWhatsappDigits(whats, atual.country) : null;
    if (whats && !digitos)
      return NextResponse.json(
        { ok: false, error: "Número de WhatsApp inválido." },
        { status: 400 },
      );
    patch.whatsapp = digitos;
    patch.whatsappSource = digitos ? "manual" : null;
  }

  // Mexer em contato muda a riqueza do lead: recalcula para a ordenacao
  // "dados mais completos" continuar honesta.
  if (patch.phone !== undefined || patch.whatsapp !== undefined || patch.email !== undefined || patch.ownerName !== undefined) {
    const merged = { ...atual, ...patch };
    patch.contactScore = contactScore({
      osmId: merged.osmId,
      companyName: merged.companyName,
      ownerName: merged.ownerName ?? null,
      phone: merged.phone ?? null,
      phoneAlt: merged.phoneAlt,
      whatsapp: merged.whatsapp ?? null,
      whatsappSource: merged.whatsappSource ?? null,
      email: merged.email ?? null,
      website: merged.website,
      address: merged.address,
      city: merged.city,
      neighborhood: merged.neighborhood,
      postcode: merged.postcode,
      lat: merged.lat,
      lon: merged.lon,
      instagram: merged.instagram,
      facebook: merged.facebook,
      linkedin: merged.linkedin,
      openingHours: merged.openingHours,
      categoryRaw: merged.categoryRaw,
      rating: merged.rating,
      reviewsCount: merged.reviewsCount,
      priceLevel: merged.priceLevel,
      googleMapsUri: merged.googleMapsUri,
      extra: null,
    });
  }

  const [updated] = await db
    .update(leads)
    .set(patch)
    .where(eq(leads.id, id))
    .returning();
  if (!updated)
    return NextResponse.json({ ok: false, error: "Lead não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true, lead: updated });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const [deleted] = await db.delete(leads).where(eq(leads.id, id)).returning();
  if (!deleted)
    return NextResponse.json({ ok: false, error: "Lead não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
