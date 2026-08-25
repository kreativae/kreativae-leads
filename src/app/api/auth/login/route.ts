import { NextResponse } from "next/server";
import { db } from "@/db";
import { totpChallenges, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "@/lib/password";
import { audit, createSession, setSessionCookie } from "@/lib/auth";
import { assertSameOrigin, clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

// Pre-computed once to keep response time constant for unknown emails.
let dummyHash: string | null = null;

export async function POST(req: Request) {
  if (!assertSameOrigin(req))
    return NextResponse.json({ ok: false, error: "Origem inválida." }, { status: 403 });

  const ip = clientIp(req);
  const ipLimited = rateLimit(`login:ip:${ip}`, 30, 15 * 60);
  if (ipLimited !== null)
    return NextResponse.json(
      { ok: false, error: `Muitas tentativas. Aguarde ${Math.ceil(ipLimited / 60)} min.` },
      { status: 429 },
    );

  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password)
    return NextResponse.json(
      { ok: false, error: "Informe e-mail e senha." },
      { status: 400 },
    );

  const generic = NextResponse.json(
    { ok: false, error: "Credenciais inválidas." },
    { status: 401 },
  );

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    if (!dummyHash) dummyHash = await hashPassword("timing-equalizer" + ip);
    await verifyPassword(password, dummyHash); // constant-ish time
    await audit({ event: "login_failed_unknown", req, detail: email });
    return generic;
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    await audit({ userId: user.id, event: "login_locked_attempt", req });
    return NextResponse.json(
      {
        ok: false,
        error: `Conta temporariamente bloqueada por tentativas inválidas. Tente em ${mins} min.`,
      },
      { status: 423 },
    );
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedAttempts + 1;
    const lock = attempts >= MAX_ATTEMPTS;
    await db
      .update(users)
      .set(
        lock
          ? {
              failedAttempts: 0,
              lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000),
            }
          : { failedAttempts: attempts },
      )
      .where(eq(users.id, user.id));
    await audit({
      userId: user.id,
      event: lock ? "login_failed_locked" : "login_failed",
      req,
      detail: lock ? `${LOCK_MINUTES}min lock after ${attempts} attempts` : undefined,
    });
    return generic;
  }

  // 2FA step — valid password is held for 5 minutes behind a challenge
  if (user.totpEnabled === "yes") {
    await db.delete(totpChallenges).where(eq(totpChallenges.userId, user.id));
    const [challenge] = await db
      .insert(totpChallenges)
      .values({
        userId: user.id,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      })
      .returning();
    await audit({ userId: user.id, event: "login_totp_required", req });
    return NextResponse.json({ ok: true, needTotp: true, challengeId: challenge.id });
  }

  await db
    .update(users)
    .set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  const { token, expiresAt } = await createSession({ userId: user.id, req });
  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
  setSessionCookie(res, token, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  await audit({ userId: user.id, event: "login_success", req });
  return res;
}
