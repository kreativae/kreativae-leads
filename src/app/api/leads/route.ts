import { NextResponse } from "next/server";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { and, count, desc, eq, ilike, isNotNull, or, type SQL } from "drizzle-orm";
import { LEAD_STATUSES } from "@/lib/constants";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const OPPORTUNITIES = ["no_website", "outdated", "modern", "unreviewed"];

function escapeLike(v: string): string {
  return v.replace(/[%_]/g, " ").trim();
}

export async function GET(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const sp = new URL(req.url).searchParams;
  const q = escapeLike(sp.get("q") ?? "");
  const segment = sp.get("segment") ?? "";
  const city = sp.get("city") ?? "";
  const status = sp.get("status") ?? "";
  const opportunity = sp.get("opportunity") ?? "";
  const onlyWhats = sp.get("whatsapp") === "1";
  const sort = sp.get("sort") === "score" ? "score" : "recent";
  const limit = Math.max(1, Math.min(120, Number(sp.get("limit")) || 48));
  const offset = Math.max(0, Number(sp.get("offset")) || 0);

  const conds: SQL[] = [];
  if (q)
    conds.push(
      or(
        ilike(leads.companyName, `%${q}%`),
        ilike(leads.ownerName, `%${q}%`),
        ilike(leads.phone, `%${q}%`),
      ) as SQL,
    );
  if (segment) conds.push(eq(leads.segment, segment));
  if (city) conds.push(eq(leads.city, city));
  if (status && LEAD_STATUSES.some((s) => s.key === status))
    conds.push(eq(leads.status, status));
  if (opportunity && OPPORTUNITIES.includes(opportunity))
    conds.push(eq(leads.opportunity, opportunity));
  if (onlyWhats) conds.push(isNotNull(leads.whatsapp));

  const where = conds.length ? and(...conds) : undefined;

  const [rows, totalRows, segmentFacets, cityFacets] = await Promise.all([
    db
      .select()
      .from(leads)
      .where(where)
      .orderBy(
        ...(sort === "score"
          ? [desc(leads.contactScore), desc(leads.createdAt)]
          : [desc(leads.createdAt)]),
      )
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(leads).where(where),
    db.selectDistinct({ value: leads.segment }).from(leads),
    db.selectDistinct({ value: leads.city }).from(leads),
  ]);

  return NextResponse.json({
    leads: rows,
    total: totalRows[0]?.value ?? 0,
    segments: segmentFacets.map((r) => r.value).filter(Boolean).sort(),
    cities: cityFacets.map((r) => r.value).filter(Boolean).sort(),
  });
}
