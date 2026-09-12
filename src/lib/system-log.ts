import { db } from "@/db";
import { systemLogs } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

export type LogSource =
  | "instagram_lookup"
  | "whatsapp_webhook"
  | "enrich_queue"
  | "wa_send";

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
