import { NextResponse } from "next/server";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { LEAD_STATUSES } from "@/lib/constants";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  let body: { status?: unknown; notes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const patch: { status?: string; notes?: string | null; updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (typeof body.status === "string") {
    if (!LEAD_STATUSES.some((s) => s.key === body.status))
      return NextResponse.json(
        { ok: false, error: "Status inválido." },
        { status: 400 },
      );
    patch.status = body.status;
  }
  if (typeof body.notes === "string" || body.notes === null) {
    patch.notes = typeof body.notes === "string" ? body.notes.slice(0, 4000) : null;
  }

  const [updated] = await db
    .update(leads)
    .set(patch)
    .where(eq(leads.id, id))
    .returning();
  if (!updated)
    return NextResponse.json({ ok: false, error: "Lead não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true, lead: updated });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const [deleted] = await db.delete(leads).where(eq(leads.id, id)).returning();
  if (!deleted)
    return NextResponse.json({ ok: false, error: "Lead não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
