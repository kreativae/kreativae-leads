import { NextResponse } from "next/server";
import { db } from "@/db";
import { iaFila } from "@/db/schema";
import { desc } from "drizzle-orm";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX = 100;

/** Fila da aba IA — compartilhada no banco, não mais presa ao navegador. */
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const rows = await db
    .select()
    .from(iaFila)
    .orderBy(desc(iaFila.criadoEm))
    .limit(MAX);
  return NextResponse.json({ ok: true, fila: rows });
}

export async function DELETE(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const all = new URL(req.url).searchParams.get("all") === "true";
  if (!all)
    return NextResponse.json(
      { ok: false, error: "Use /api/ia/fila/[id] para remover um item." },
      { status: 400 },
    );
  await db.delete(iaFila);
  return NextResponse.json({ ok: true });
}
