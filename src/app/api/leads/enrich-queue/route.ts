import { NextResponse } from "next/server";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { and, desc, isNotNull, isNull } from "drizzle-orm";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Teto por rodada — evita uma fila longa demais para o usuario acompanhar. */
const MAX = 400;

/**
 * Fila do enriquecimento em lote: leads que tem site e nunca foram varridos.
 * Ordena pelos de melhor contato primeiro, para o retorno vir logo no inicio.
 */
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const rows = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(isNotNull(leads.website), isNull(leads.enrichedAt)))
    .orderBy(desc(leads.contactScore))
    .limit(MAX);

  return NextResponse.json({ ids: rows.map((r) => r.id), total: rows.length });
}
