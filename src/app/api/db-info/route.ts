import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { requireOwner } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface StatusRow extends Record<string, unknown> {
  server_time: string;
  size_bytes: string;
  connections: string;
  version: string;
}

interface LastRow extends Record<string, unknown> {
  source: string;
  at: string | null;
}

const SOURCE_LABEL: Record<string, string> = {
  leads: "Leads",
  searches: "Buscas",
  messages: "Mensagens (WhatsApp)",
  system_logs: "Logs do sistema",
  conversations: "Conversas",
};

/** Autodiagnóstico do Neon: latência real, tamanho do banco e o registro mais recente por tabela. */
export async function GET() {
  const auth = await requireOwner();
  if (auth.error) return auth.error;

  const startedAt = Date.now();
  try {
    const status = await db.execute<StatusRow>(sql`
      select
        now()::text as server_time,
        pg_database_size(current_database())::text as size_bytes,
        (select count(*)::text from pg_stat_activity where datname = current_database()) as connections,
        version() as version
    `);
    const latencyMs = Date.now() - startedAt;
    const row = status.rows[0];

    const last = await db.execute<LastRow>(sql`
      select 'leads' as source, max(created_at)::text as at from leads
      union all
      select 'searches', max(created_at)::text from searches
      union all
      select 'messages', max(created_at)::text from messages
      union all
      select 'system_logs', max(created_at)::text from system_logs
      union all
      select 'conversations', max(updated_at)::text from conversations
      order by at desc nulls last
    `);

    return NextResponse.json({
      ok: true,
      latencyMs,
      serverTime: row.server_time,
      sizeMb: Math.round((Number(row.size_bytes) / (1024 * 1024)) * 10) / 10,
      connections: Number(row.connections),
      version: row.version.split(",")[0],
      lastRecords: last.rows.map((r) => ({
        source: SOURCE_LABEL[r.source] ?? r.source,
        at: r.at,
      })),
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : "Falha na conexão com o banco.",
    });
  }
}
