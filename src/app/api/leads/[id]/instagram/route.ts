import { NextResponse } from "next/server";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { igHandle, lookupIgProfile } from "@/lib/instagram";
import { getIgConfig } from "@/lib/settings-db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  const config = await getIgConfig();
  if (!config)
    return NextResponse.json(
      {
        ok: false,
        error:
          "Instagram não configurado. Preencha o token e o ID da conta em Configurações.",
      },
      { status: 400 },
    );

  const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!lead)
    return NextResponse.json({ ok: false, error: "Lead não encontrado." }, { status: 404 });

  const handle = igHandle(lead.instagram);
  if (!handle)
    return NextResponse.json(
      {
        ok: false,
        error:
          "Este lead não tem perfil do Instagram. Rode o enriquecimento para tentar descobrir.",
      },
      { status: 400 },
    );

  const result = await lookupIgProfile({ ...config, handle });

  if (!result.ok) {
    // Perfil pessoal / inexistente: marca como verificado para nao repetir a consulta.
    if (result.reason === "not_business") {
      await db
        .update(leads)
        .set({ igUsername: handle, igCheckedAt: new Date(), updatedAt: new Date() })
        .where(eq(leads.id, id));
    }
    const status =
      result.reason === "auth" ? 401 : result.reason === "rate_limit" ? 429 : 502;
    return NextResponse.json(
      { ok: false, error: result.error, reason: result.reason },
      { status },
    );
  }

  const p = result.profile;
  const [updated] = await db
    .update(leads)
    .set({
      igUsername: p.username,
      igFollowers: p.followersCount,
      igMediaCount: p.mediaCount,
      igBiography: p.biography?.slice(0, 1000) ?? null,
      igCheckedAt: new Date(),
      // O site declarado na bio costuma ser mais atual que o do mapa.
      website: lead.website ?? p.website ?? null,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, id))
    .returning();

  return NextResponse.json({ ok: true, lead: updated, profile: p });
}
