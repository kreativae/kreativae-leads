import { db } from "@/db";
import { settings } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";

const CHAVE_CONTADOR = "places_billable_requests";
const CHAVE_DESDE = "places_billable_requests_since";

/**
 * Preco por requisicao faturavel do Google Places API (New), Text Search.
 * O field mask que este app pede (endereco completo, telefone, horarios,
 * tipo primario, avaliacoes etc.) cai no SKU Enterprise: US$ 35 a cada 1000
 * requisicoes — nao no SKU Essentials, mais barato, que cobre so um
 * subconjunto pequeno de campos.
 *
 * Fonte: tabela de precos publica do Google Maps Platform para Places API
 * (New), consultada ao escrever este arquivo. A Google reajusta precos sem
 * aviso prévio aqui dentro — confira o valor atual antes de fechar
 * orcamento por esse numero.
 */
export const PRECO_POR_REQUISICAO_USD = 0.035;

/**
 * Chama uma vez por pagina de resultado de fato pedida ao Google (cada
 * pagina e uma requisicao HTTP separada e cada uma e faturada). Incrementa
 * um contador global no banco, atomico via UPSERT — nao e por lead nem por
 * pesquisa, e por CHAMADA, que e a unidade que a Google cobra.
 */
export async function registrarRequisicoesPlaces(n: number): Promise<void> {
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
  // So grava na primeira vez: marca desde quando a contagem esta rodando,
  // para o texto "contando desde X" na tela nao virar hoje a cada chamada.
  await db
    .insert(settings)
    .values({ key: CHAVE_DESDE, value: new Date().toISOString(), updatedAt: new Date() })
    .onConflictDoNothing({ target: settings.key });
}

export interface CustoPlaces {
  requisicoes: number;
  desde: string | null;
  precoPorRequisicao: number;
  custoUsd: number;
}

export async function lerCustoPlaces(): Promise<CustoPlaces> {
  const linhas = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, [CHAVE_CONTADOR, CHAVE_DESDE]));
  const mapa = new Map(linhas.map((l) => [l.key, l.value]));
  const requisicoes = parseInt(mapa.get(CHAVE_CONTADOR) ?? "0", 10) || 0;
  return {
    requisicoes,
    desde: mapa.get(CHAVE_DESDE) ?? null,
    precoPorRequisicao: PRECO_POR_REQUISICAO_USD,
    custoUsd: Math.round(requisicoes * PRECO_POR_REQUISICAO_USD * 100) / 100,
  };
}
