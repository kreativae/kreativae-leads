import { NextResponse } from "next/server";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { and, count, desc, eq, max, type SQL } from "drizzle-orm";
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

  const sp = new URL(req.url).searchParams;
  const incluirNovos = sp.get("novos") === "1";
  // Filtra pelo que esta gravado no proprio lead. Filtrar por search_id
  // esconderia os leads cuja pesquisa foi apagada (39% da base hoje) e
  // mostraria vazias as pesquisas cujos leads foram revinculados a uma
  // rodada posterior.
  const segmento = sp.get("segmento") ?? "";
  const cidade = sp.get("cidade") ?? "";
  const escopo: SQL[] = [];
  if (segmento) escopo.push(eq(leads.segment, segmento));
  if (cidade) escopo.push(eq(leads.city, cidade));
  const filtro = (chave: string) =>
    escopo.length ? and(eq(leads.status, chave), ...escopo) : eq(leads.status, chave);
  const chaves = LEAD_STATUSES.map((s) => s.key).filter(
    (k) => incluirNovos || k !== "new",
  );

  const colunas = await Promise.all(
    chaves.map(async (chave) => {
      const [cards, totalRows] = await Promise.all([
        db
          .select()
          .from(leads)
          .where(filtro(chave))
          .orderBy(desc(leads.contactScore), desc(leads.createdAt))
          .limit(POR_COLUNA),
        db.select({ value: count() }).from(leads).where(filtro(chave)),
      ]);
      return { status: chave, total: totalRows[0]?.value ?? 0, leads: cards };
    }),
  );

  // O total de "novos" e util no cabecalho mesmo quando a coluna esta oculta.
  const [novos] = await db
    .select({ value: count() })
    .from(leads)
    .where(filtro("new"));

  // Os grupos vem dos leads, nao da tabela de pesquisas: assim nenhum lead
  // fica de fora e nenhum grupo aparece vazio.
  const grupos = await db
    .select({
      segment: leads.segment,
      city: leads.city,
      country: leads.country,
      total: count(),
      // Data do lead mais novo do grupo: e o "quando isto foi pesquisado"
      // que o usuario reconhece, e nao depende da pesquisa ainda existir.
      lastAt: max(leads.createdAt),
    })
    .from(leads)
    .groupBy(leads.segment, leads.city, leads.country)
    .orderBy(desc(max(leads.createdAt)));

  return NextResponse.json({
    columns: colunas,
    newTotal: novos?.value ?? 0,
    groups: grupos.filter((g) => g.city),
  });
}
