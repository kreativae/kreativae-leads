import { NextResponse } from "next/server";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { analyzeWebsite } from "@/lib/site-analyzer";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!lead)
    return NextResponse.json({ ok: false, error: "Lead não encontrado." }, { status: 404 });
  if (!lead.website)
    return NextResponse.json(
      { ok: false, error: "Este lead não possui site cadastrado." },
      { status: 400 },
    );

  const analysis = await analyzeWebsite(lead.website);
  const opportunity = analysis.grade === "modern" ? "modern" : "outdated";

  const [updated] = await db
    .update(leads)
    .set({
      websiteScore: analysis.score,
      websiteGrade: analysis.grade,
      websiteChecks: analysis.checks,
      analyzedAt: new Date(),
      opportunity,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, id))
    .returning();

  return NextResponse.json({ ok: true, analysis, lead: updated });
}
