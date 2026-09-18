import { NextResponse } from "next/server";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { igHandle, lookupIgProfile } from "@/lib/instagram";
import { getIgConfig } from "@/lib/settings-db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Busca por @ — a Instagram Business Discovery não permite descoberta por
 * cidade/categoria, só consulta um handle já conhecido. Por isso devolve NO
 * MÁXIMO um candidato (o próprio perfil), não uma lista.
 */
export async function GET(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const sp = new URL(req.url).searchParams;
  const handle = igHandle(sp.get("handle"));
  if (!handle)
    return NextResponse.json(
      { ok: false, error: "Informe um @ válido (letras, números, ponto ou underline)." },
      { status: 400 },
    );

  const config = await getIgConfig();
  if (!config)
    return NextResponse.json(
      {
        ok: false,
        error: "Instagram não configurado — adicione o token e o ID da conta em Configurações.",
      },
      { status: 400 },
    );

  const result = await lookupIgProfile({ ...config, handle });
  if (!result.ok) {
    const status =
      result.reason === "auth" ? 401 : result.reason === "rate_limit" ? 429 : 502;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  const osmId = `ig:${handle}`;
  const [existing] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.osmId, osmId))
    .limit(1);

  const p = result.profile;
  return NextResponse.json({
    ok: true,
    candidate: {
      osmId,
      companyName: p.name?.trim() || `@${handle}`,
      ownerName: null,
      phone: null,
      whatsapp: null,
      email: null,
      website: p.website,
      address: null,
      city: null,
      categoryRaw: null,
      rating: null,
      reviewsCount: null,
      googleMapsUri: null,
      instagram: `https://instagram.com/${p.username}`,
      existingLeadId: existing?.id ?? null,
      instagramHandle: p.username,
      instagramFollowers: p.followersCount,
      instagramMediaCount: p.mediaCount,
      instagramBio: p.biography,
    },
  });
}
