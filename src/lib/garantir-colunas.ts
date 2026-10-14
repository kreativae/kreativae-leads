import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Cria em produção as colunas novas de "messages" (delivered_at, read_at)
 * se a migração 0011 ainda não tiver sido aplicada lá. Sem elas, qualquer
 * select/insert do drizzle em messages quebraria a tela de Conversas e o
 * webhook — então quem toca a tabela chama isto antes.
 *
 * Roda uma vez por instância (a promessa fica em memória) e só faz ALTER
 * quando falta coluna de verdade: checar antes evita pegar o lock exclusivo
 * da tabela à toa a cada cold start.
 */
let pronto: Promise<void> | null = null;

export function garantirColunasMensagens(): Promise<void> {
  pronto ??= (async () => {
    const { rows } = await db.execute<{ column_name: string }>(sql`
      select column_name from information_schema.columns
      where table_name = 'messages' and column_name in ('delivered_at', 'read_at')
    `);
    if (rows.length === 2) return;
    await db.execute(sql`
      alter table "messages"
        add column if not exists "delivered_at" timestamp with time zone,
        add column if not exists "read_at" timestamp with time zone
    `);
  })().catch((err) => {
    // Falhou (ex.: sem permissão de ALTER)? Deixa tentar de novo na próxima
    // chamada em vez de travar a instância num erro permanente.
    pronto = null;
    throw err;
  });
  return pronto;
}
