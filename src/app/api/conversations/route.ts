import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversations, leads, waAccounts } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { listWaAccounts, isWaEnabled } from "@/lib/settings-db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const sp = new URL(req.url).searchParams;

  if (sp.get("summary") === "1") {
    const [row] = await db
      .select({ unread: sql<number>`coalesce(sum(${conversations.unreadCount}), 0)` })
      .from(conversations);
    return NextResponse.json({
      unread: Number(row?.unread ?? 0),
      wa_configured: (await listWaAccounts()).length > 0,
      wa_enabled: await isWaEnabled(),
    });
  }

  const [rows, accounts] = await Promise.all([
    db
      .select({
        conversation: conversations,
        leadCompany: leads.companyName,
        leadSegment: leads.segment,
        waAccountLabel: waAccounts.label,
      })
      .from(conversations)
      .leftJoin(leads, eq(conversations.leadId, leads.id))
      .leftJoin(waAccounts, eq(conversations.waAccountId, waAccounts.id))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(200),
    listWaAccounts(),
  ]);

  return NextResponse.json({
    conversations: rows.map((r) => ({
      ...r.conversation,
      leadCompany: r.leadCompany,
      leadSegment: r.leadSegment,
      waAccountLabel: r.waAccountLabel,
    })),
    // Rotulo de cada conta, para a tela mostrar "Brasil" / "Portugal" em vez
    // do numero cru — e para filtrar mesmo uma conta sem conversa nenhuma.
    waAccounts: accounts.map((a) => ({ id: a.id, label: a.label, displayPhone: a.displayPhone })),
    wa_configured: accounts.length > 0,
    wa_enabled: await isWaEnabled(),
  });
}
