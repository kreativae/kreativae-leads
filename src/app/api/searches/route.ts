import { NextResponse } from "next/server";
import { db } from "@/db";
import { searches } from "@/db/schema";
import { desc } from "drizzle-orm";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const rows = await db
    .select()
    .from(searches)
    .orderBy(desc(searches.createdAt))
    .limit(100);
  return NextResponse.json({ searches: rows });
}
