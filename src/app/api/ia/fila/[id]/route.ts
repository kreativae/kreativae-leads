import { NextResponse } from "next/server";
import { db } from "@/db";
import { iaFila } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

interface Body {
  imageUrl?: unknown;
  status?: unknown;
  candidato?: unknown;
  edicao?: unknown;
  erro?: unknown;
  leadAdicionadoId?: unknown;
}

/**
 * Upsert de um item da fila: a primeira chamada (assim que o upload começa,
 * com só {status:"enviando"}) já cria a linha; as próximas atualizam. Isso
 * evita depender de um POST de criação anterior sempre ter dado certo.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const campos: Record<string, unknown> = {};
  if (typeof body.imageUrl === "string") campos.imageUrl = body.imageUrl;
  if (typeof body.status === "string") campos.status = body.status;
  if (body.candidato !== undefined) campos.candidato = body.candidato;
  if (body.edicao !== undefined) campos.edicao = body.edicao;
  if (body.erro !== undefined) campos.erro = typeof body.erro === "string" ? body.erro : null;
  if (body.leadAdicionadoId !== undefined)
    campos.leadAdicionadoId =
      typeof body.leadAdicionadoId === "string" ? body.leadAdicionadoId : null;

  await db
    .insert(iaFila)
    .values({ id, status: typeof campos.status === "string" ? campos.status : "enviando", ...campos, atualizadoEm: new Date() })
    .onConflictDoUpdate({
      target: iaFila.id,
      set: { ...campos, atualizadoEm: new Date() },
    });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  await db.delete(iaFila).where(eq(iaFila.id, id));
  return NextResponse.json({ ok: true });
}
