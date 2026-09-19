import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ANTHROPIC_MODELS } from "@/lib/anthropic-models";

const CHAVE = "anthropic_usage";

interface ModelUsage {
  noCacheInputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  calls: number;
}

interface UsageState {
  since: string;
  models: Record<string, ModelUsage>;
}

function vazio(): ModelUsage {
  return { noCacheInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, calls: 0 };
}

async function lerEstado(): Promise<UsageState> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, CHAVE))
    .limit(1);
  if (!row?.value) return { since: new Date().toISOString(), models: {} };
  try {
    return JSON.parse(row.value) as UsageState;
  } catch {
    return { since: new Date().toISOString(), models: {} };
  }
}

/**
 * Soma os tokens de uma chamada ao contador do modelo usado. Lê-modifica-
 * grava direto na tabela de settings (sem incremento atômico em SQL) — pra
 * um uso pessoal/pequena equipe como este, o risco de duas chamadas
 * simultâneas se sobrescreverem é baixo e não compensa a complexidade.
 */
export async function registrarUsoAnthropic(
  modelId: string,
  tokens: {
    noCacheInputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    outputTokens: number;
  },
): Promise<void> {
  const estado = await lerEstado();
  const atual = estado.models[modelId] ?? vazio();
  estado.models[modelId] = {
    noCacheInputTokens: atual.noCacheInputTokens + tokens.noCacheInputTokens,
    cacheReadTokens: atual.cacheReadTokens + tokens.cacheReadTokens,
    cacheWriteTokens: atual.cacheWriteTokens + tokens.cacheWriteTokens,
    outputTokens: atual.outputTokens + tokens.outputTokens,
    calls: atual.calls + 1,
  };
  const value = JSON.stringify(estado);
  await db
    .insert(settings)
    .values({ key: CHAVE, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

export interface CustoAnthropicModelo extends ModelUsage {
  modelId: string;
  label: string;
  custoUsd: number;
}

export interface CustoAnthropic {
  desde: string | null;
  modelos: CustoAnthropicModelo[];
  custoUsd: number;
}

function custoDoModelo(modelId: string, u: ModelUsage): number {
  const preco = ANTHROPIC_MODELS.find((m) => m.id === modelId);
  if (!preco) return 0;
  return (
    (u.noCacheInputTokens / 1_000_000) * preco.priceInput +
    (u.cacheReadTokens / 1_000_000) * preco.priceCacheRead +
    (u.cacheWriteTokens / 1_000_000) * preco.priceCacheWrite +
    (u.outputTokens / 1_000_000) * preco.priceOutput
  );
}

export async function lerCustoAnthropic(): Promise<CustoAnthropic> {
  const estado = await lerEstado();
  const modelos = Object.entries(estado.models).map(([modelId, u]) => {
    const preco = ANTHROPIC_MODELS.find((m) => m.id === modelId);
    return {
      modelId,
      label: preco?.label ?? modelId,
      ...u,
      custoUsd: Math.round(custoDoModelo(modelId, u) * 10_000) / 10_000,
    };
  });
  const custoUsd = Math.round(modelos.reduce((s, m) => s + m.custoUsd, 0) * 10_000) / 10_000;
  return { desde: modelos.length > 0 ? estado.since : null, modelos, custoUsd };
}
