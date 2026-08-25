import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { getWaConfig } from "@/lib/settings-db";
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
      wa_configured: !!(await getWaConfig()),
    });
  }

  const rows = await db
    .select({
      conversation: conversations,
      leadCompany: leads.companyName,
      leadSegment: leads.segment,
    })
    .from(conversations)
    .leftJoin(leads, eq(conversations.leadId, leads.id))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(200);

  return NextResponse.json({
    conversations: rows.map((r) => ({
      ...r.conversation,
      leadCompany: r.leadCompany,
      leadSegment: r.leadSegment,
    })),
    wa_configured: !!(await getWaConfig()),
  });
}
