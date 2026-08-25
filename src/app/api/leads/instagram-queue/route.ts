import { NextResponse } from "next/server";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { and, desc, isNotNull, isNull } from "drizzle-orm";
import { getIgConfig } from "@/lib/settings-db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX = 200;

/** Leads que tem handle do Instagram e ainda nao foram consultados na API. */
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const configured = !!(await getIgConfig());
  const rows = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(isNotNull(leads.instagram), isNull(leads.igCheckedAt)))
    .orderBy(desc(leads.contactScore))
    .limit(MAX);

  return NextResponse.json({
    ids: rows.map((r) => r.id),
    total: rows.length,
    configured,
  });
}
