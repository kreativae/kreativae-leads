import { NextResponse } from "next/server";
import { db } from "@/db";
import { buscadorHistorico } from "@/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX = 15;

function chaveHistorico(modo: string, query: string, city: string, country: string): string {
  return `${modo}|${query.trim().toLowerCase()}|${city.trim().toLowerCase()}|${country}`;
}

/** Histórico do Buscador — compartilhado no banco, não mais preso ao navegador. */
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const rows = await db
    .select()
    .from(buscadorHistorico)
    .orderBy(desc(buscadorHistorico.atualizadoEm))
    .limit(MAX);
  return NextResponse.json({ ok: true, historico: rows });
}

interface Body {
  modo?: unknown;
  query?: unknown;
  city?: unknown;
  country?: unknown;
  candidates?: unknown;
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const modo = body.modo === "instagram" ? "instagram" : "nome";
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const city = typeof body.city === "string" ? body.city.trim() : "";
  const country = body.country === "PT" ? "PT" : "BR";
  if (!query || !Array.isArray(body.candidates))
    return NextResponse.json({ ok: false, error: "Dados inválidos." }, { status: 400 });

  const chave = chaveHistorico(modo, query, city, country);
  await db
    .insert(buscadorHistorico)
    .values({
      chave,
      modo,
      query,
      city,
      country,
      candidatos: body.candidates,
      atualizadoEm: new Date(),
    })
    .onConflictDoUpdate({
      target: buscadorHistorico.chave,
      set: { candidatos: body.candidates, atualizadoEm: new Date(), query, city, country, modo },
    });

  // Mantém só as N mais recentes — sem isso a tabela cresce sem limite.
  const antigos = await db
    .select({ chave: buscadorHistorico.chave })
    .from(buscadorHistorico)
    .orderBy(desc(buscadorHistorico.atualizadoEm))
    .offset(MAX);
  if (antigos.length > 0) {
    await db
      .delete(buscadorHistorico)
      .where(
        inArray(
          buscadorHistorico.chave,
          antigos.map((a) => a.chave),
        ),
      );
  }

  return NextResponse.json({ ok: true, chave });
}

export async function DELETE(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const sp = new URL(req.url).searchParams;
  const chave = sp.get("chave");
  const all = sp.get("all") === "true";
  if (all) {
    await db.delete(buscadorHistorico);
    return NextResponse.json({ ok: true });
  }
  if (!chave)
    return NextResponse.json({ ok: false, error: "Informe a chave ou all=true." }, { status: 400 });
  await db.delete(buscadorHistorico).where(eq(buscadorHistorico.chave, chave));
  return NextResponse.json({ ok: true });
}
