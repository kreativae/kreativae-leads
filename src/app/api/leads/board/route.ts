import { NextResponse } from "next/server";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { count, desc, eq } from "drizzle-orm";
import { LEAD_STATUSES } from "@/lib/constants";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Teto por coluna: um quadro com milhares de cartoes trava o navegador. */
const POR_COLUNA = 60;

/**
 * Quadro do CRM: os leads de cada status, com o total real de cada coluna
 * (que pode ser maior que os cartoes devolvidos).
 */
export async function GET(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const incluirNovos = new URL(req.url).searchParams.get("novos") === "1";
  const chaves = LEAD_STATUSES.map((s) => s.key).filter(
    (k) => incluirNovos || k !== "new",
  );

  const colunas = await Promise.all(
    chaves.map(async (chave) => {
      const [cards, totalRows] = await Promise.all([
        db
          .select()
          .from(leads)
          .where(eq(leads.status, chave))
          .orderBy(desc(leads.contactScore), desc(leads.createdAt))
          .limit(POR_COLUNA),
        db.select({ value: count() }).from(leads).where(eq(leads.status, chave)),
      ]);
      return { status: chave, total: totalRows[0]?.value ?? 0, leads: cards };
    }),
  );

  // O total de "novos" e util no cabecalho mesmo quando a coluna esta oculta.
  const [novos] = await db
    .select({ value: count() })
    .from(leads)
    .where(eq(leads.status, "new"));

  return NextResponse.json({ columns: colunas, newTotal: novos?.value ?? 0 });
}
