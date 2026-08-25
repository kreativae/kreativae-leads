import { NextResponse } from "next/server";
import { db } from "@/db";
import { leads, searches } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  // Keep the leads, just unlink them from the search record.
  await db.update(leads).set({ searchId: null }).where(eq(leads.searchId, id));
  const [deleted] = await db.delete(searches).where(eq(searches.id, id)).returning();
  if (!deleted)
    return NextResponse.json(
      { ok: false, error: "Pesquisa não encontrada." },
      { status: 404 },
    );
  return NextResponse.json({ ok: true });
}
