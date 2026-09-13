import { db } from "@/db";
import { systemLogs } from "@/db/schema";
import { and, desc, eq, lt } from "drizzle-orm";

export type LogSource =
  | "search"
  | "instagram_lookup"
  | "whatsapp_webhook"
  | "enrich_queue"
  | "wa_send"
  | "automation";

const RETENCAO_PADRAO_DIAS = 90;

/**
 * Grava uma linha no historico de execucoes. Nunca lanca — uma falha ao
 * registrar o log nao pode derrubar a operacao real que estava sendo
 * logada.
 */
export async function logEvent(entry: {
  source: LogSource;
  status: "ok" | "error";
  message: string;
  detail?: string | null;
  leadId?: string | null;
}): Promise<void> {
  await db
    .insert(systemLogs)
    .values({
      source: entry.source,
      status: entry.status,
      message: entry.message.slice(0, 500),
      detail: entry.detail?.slice(0, 2000) ?? null,
      leadId: entry.leadId ?? null,
    })
    .catch(() => undefined);

  // Sem cron neste projeto — em vez disso, toda gravacao tem uma chance
  // pequena de tambem podar o que passou da retencao padrao, o suficiente
  // pra tabela nao crescer pra sempre sem precisar de infra nova.
  if (Math.random() < 0.02) await deleteOldLogs(RETENCAO_PADRAO_DIAS).catch(() => undefined);
}

/** Apaga logs mais antigos que N dias. Retorna quantos foram removidos. */
export async function deleteOldLogs(olderThanDays: number): Promise<number> {
  const limite = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const removidos = await db
    .delete(systemLogs)
    .where(lt(systemLogs.createdAt, limite))
    .returning({ id: systemLogs.id });
  return removidos.length;
}

export async function listLogs(filters: {
  source?: LogSource;
  status?: "ok" | "error";
  limit?: number;
}) {
  const conditions = [];
  if (filters.source) conditions.push(eq(systemLogs.source, filters.source));
  if (filters.status) conditions.push(eq(systemLogs.status, filters.status));

  const rows = await db
    .select()
    .from(systemLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(systemLogs.createdAt))
    .limit(Math.min(filters.limit ?? 100, 500));
  return rows;
}
