import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const rows = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.userId, auth.user.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(12);
  return NextResponse.json({ activity: rows });
}
