import { NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, totpChallenges, users } from "@/db/schema";
import { and, count, eq, ne } from "drizzle-orm";
import { checkPassword, hashPassword } from "@/lib/password";
import { audit, requireOwner } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      totpEnabled: users.totpEnabled,
      mustChangePassword: users.mustChangePassword,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(users.createdAt);
  return NextResponse.json({ users: rows });
}

export async function POST(req: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  if (!assertSameOrigin(req))
    return NextResponse.json({ ok: false, error: "Origem inválida." }, { status: 403 });

  let body: { name?: unknown; email?: unknown; password?: unknown; role?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const role = body.role === "owner" ? "owner" : "member";

  if (name.length < 2 || name.length > 80)
    return NextResponse.json({ ok: false, error: "Informe o nome." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
    return NextResponse.json({ ok: false, error: "E-mail inválido." }, { status: 400 });
  const pw = checkPassword(password);
  if (!pw.ok)
    return NextResponse.json(
      { ok: false, error: "Senha temporária fraca: " + pw.errors.join("; ") },
      { status: 400 },
    );

  const existing = await db.select({ n: count() }).from(users).where(eq(users.email, email));
  if ((existing[0]?.n ?? 0) > 0)
    return NextResponse.json({ ok: false, error: "Este e-mail já possui conta." }, { status: 409 });

  const [user] = await db
    .insert(users)
    .values({
      name,
      email,
      passwordHash: await hashPassword(password),
      role,
      mustChangePassword: "yes", // forced password rotation on first login
    })
    .returning();
  await audit({ userId: auth.user.id, event: "user_created", req, detail: `${email} (${role})` });
  return NextResponse.json({
    ok: true,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}

export async function DELETE(req: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  if (!assertSameOrigin(req))
    return NextResponse.json({ ok: false, error: "Origem inválida." }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Usuário não informado." }, { status: 400 });
  if (id === auth.user.id)
    return NextResponse.json(
      { ok: false, error: "Você não pode excluir a própria conta por aqui." },
      { status: 400 },
    );

  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target) return NextResponse.json({ ok: false, error: "Usuário não encontrado." }, { status: 404 });

  if (target.role === "owner") {
    const [owners] = await db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.role, "owner"), ne(users.id, id)));
    if ((owners?.n ?? 0) === 0)
      return NextResponse.json(
        { ok: false, error: "O sistema precisa manter ao menos um proprietário." },
        { status: 400 },
      );
  }

  await db.delete(totpChallenges).where(eq(totpChallenges.userId, id));
  await db.delete(users).where(eq(users.id, id)); // sessions/recovery cascade
  await audit({ userId: auth.user.id, event: "user_deleted", req, detail: target.email });
  return NextResponse.json({ ok: true });
}

/** Reset password (sets a temporary one and forces change on next login). */
export async function PUT(req: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  if (!assertSameOrigin(req))
    return NextResponse.json({ ok: false, error: "Origem inválida." }, { status: 403 });

  let body: { id?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const password = typeof body.password === "string" ? body.password : "";
  const pw = checkPassword(password);
  if (!pw.ok)
    return NextResponse.json(
      { ok: false, error: "Senha temporária fraca: " + pw.errors.join("; ") },
      { status: 400 },
    );

  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target) return NextResponse.json({ ok: false, error: "Usuário não encontrado." }, { status: 404 });

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(password),
      mustChangePassword: "yes",
      failedAttempts: 0,
      lockedUntil: null,
    })
    .where(eq(users.id, id));
  await db.delete(sessions).where(eq(sessions.userId, id));
  await audit({ userId: auth.user.id, event: "user_password_reset", req, detail: target.email });
  return NextResponse.json({ ok: true });
}
