import { db } from "@/db";
import { settings } from "@/db/schema";
import { inArray, sql } from "drizzle-orm";

const CHAVE_CONTADOR = "serper_queries";
const CHAVE_DESDE = "serper_queries_since";

/**
 * Preço por consulta no Serper.dev (busca do Google via API), no pacote de
 * entrada: US$ 50 por 50 mil consultas = US$ 1 a cada 1000. Pacotes maiores
 * saem mais barato, e as 2500 primeiras de cada conta são grátis — então
 * isto é o teto, não o valor exato. Confira em serper.dev antes de fechar
 * orçamento por esse número.
 */
export const PRECO_POR_CONSULTA_USD = 0.001;

/** Uma chamada = uma página de 10 resultados = uma consulta cobrada. Mesmo UPSERT atômico do contador do Places. */
export async function registrarConsultasSerper(n: number): Promise<void> {
  if (n <= 0) return;
  await db
    .insert(settings)
    .values({ key: CHAVE_CONTADOR, value: String(n), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: {
        value: sql`(COALESCE(${settings.value}, '0')::int + ${n})::text`,
        updatedAt: new Date(),
      },
    });
  await db
    .insert(settings)
    .values({ key: CHAVE_DESDE, value: new Date().toISOString(), updatedAt: new Date() })
    .onConflictDoNothing({ target: settings.key });
}

export interface CustoSerper {
  consultas: number;
  desde: string | null;
  precoPorConsulta: number;
  custoUsd: number;
}

export async function lerCustoSerper(): Promise<CustoSerper> {
  const linhas = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, [CHAVE_CONTADOR, CHAVE_DESDE]));
  const mapa = new Map(linhas.map((l) => [l.key, l.value]));
  const consultas = parseInt(mapa.get(CHAVE_CONTADOR) ?? "0", 10) || 0;
  return {
    consultas,
    desde: mapa.get(CHAVE_DESDE) ?? null,
    precoPorConsulta: PRECO_POR_CONSULTA_USD,
    custoUsd: Math.round(consultas * PRECO_POR_CONSULTA_USD * 100) / 100,
  };
}

export async function zerarCustoSerper(): Promise<void> {
  await db.delete(settings).where(inArray(settings.key, [CHAVE_CONTADOR, CHAVE_DESDE]));
}
