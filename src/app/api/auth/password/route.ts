import { NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { checkPassword, hashPassword, verifyPassword } from "@/lib/password";
import { audit, requireUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  if (!assertSameOrigin(req))
    return NextResponse.json({ ok: false, error: "Origem inválida." }, { status: 403 });

  let body: { current?: unknown; next?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const current = typeof body.current === "string" ? body.current : "";
  const next = typeof body.next === "string" ? body.next : "";

  const [user] = await db.select().from(users).where(eq(users.id, auth.user.id)).limit(1);
  if (!user) return NextResponse.json({ ok: false, error: "Usuário não encontrado." }, { status: 404 });

  const valid = await verifyPassword(current, user.passwordHash);
  if (!valid)
    return NextResponse.json({ ok: false, error: "Senha atual incorreta." }, { status: 401 });

  const pw = checkPassword(next);
  if (!pw.ok)
    return NextResponse.json(
      { ok: false, error: "Nova senha fraca: " + pw.errors.join("; ") },
      { status: 400 },
    );
  if (await verifyPassword(next, user.passwordHash))
    return NextResponse.json(
      { ok: false, error: "A nova senha não pode ser igual à atual." },
      { status: 400 },
    );

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next), mustChangePassword: "no" })
    .where(eq(users.id, user.id));

  // Security: password change revokes every other session.
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, user.id), ne(sessions.id, auth.user.sessionId)));

  await audit({ userId: user.id, event: "password_changed", req });
  return NextResponse.json({ ok: true });
}
