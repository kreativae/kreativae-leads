import { NextResponse } from "next/server";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { and, desc, eq, ne } from "drizzle-orm";
import { audit, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, auth.user.id))
    .orderBy(desc(sessions.lastSeenAt))
    .limit(20);
  return NextResponse.json({
    sessions: rows.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ip: s.ip,
      lastSeenAt: s.lastSeenAt,
      createdAt: s.createdAt,
      current: s.id === auth.user.sessionId,
    })),
  });
}

export async function DELETE(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id");
  const others = sp.get("others") === "1";

  if (others) {
    await db
      .delete(sessions)
      .where(and(eq(sessions.userId, auth.user.id), ne(sessions.id, auth.user.sessionId)));
    await audit({ userId: auth.user.id, event: "sessions_revoked_others", req });
    return NextResponse.json({ ok: true });
  }
  if (!id) return NextResponse.json({ ok: false, error: "Sessão não informada." }, { status: 400 });
  if (id === auth.user.sessionId)
    return NextResponse.json(
      { ok: false, error: "Para sair da sessão atual, use Sair." },
      { status: 400 },
    );
  await db
    .delete(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, auth.user.id)));
  await audit({ userId: auth.user.id, event: "session_revoked", req });
  return NextResponse.json({ ok: true });
}
