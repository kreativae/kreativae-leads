import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/db";
import { recoveryCodes, totpChallenges, users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { audit, createSession, setSessionCookie } from "@/lib/auth";
import { verifyTotp } from "@/lib/totp";
import { assertSameOrigin, clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function normalizeCode(v: string): string {
  return v.replace(/[\s-]+/g, "").trim();
}

export async function POST(req: Request) {
  if (!assertSameOrigin(req))
    return NextResponse.json({ ok: false, error: "Origem inválida." }, { status: 403 });

  const ip = clientIp(req);
  const limited = rateLimit(`otp:ip:${ip}`, 20, 10 * 60);
  if (limited !== null)
    return NextResponse.json(
      { ok: false, error: `Muitas tentativas. Aguarde ${Math.ceil(limited / 60)} min.` },
      { status: 429 },
    );

  let body: { challengeId?: unknown; code?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const challengeId = typeof body.challengeId === "string" ? body.challengeId : "";
  const code = normalizeCode(typeof body.code === "string" ? body.code : "");
  if (!challengeId || !code)
    return NextResponse.json(
      { ok: false, error: "Informe o código do aplicativo autenticador." },
      { status: 400 },
    );

  const [challenge] = await db
    .select()
    .from(totpChallenges)
    .where(eq(totpChallenges.id, challengeId))
    .limit(1);
  if (!challenge || challenge.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json(
      { ok: false, error: "Sessão de verificação expirada. Faça login novamente." },
      { status: 401 },
    );
  }

  const [user] = await db.select().from(users).where(eq(users.id, challenge.userId)).limit(1);
  if (!user || user.totpEnabled !== "yes" || !user.totpSecret) {
    return NextResponse.json({ ok: false, error: "2FA não ativo." }, { status: 400 });
  }

  let usedRecovery = false;
  let valid = false;

  if (/^\d{6}$/.test(code)) {
    valid = verifyTotp(user.totpSecret, code);
  }
  if (!valid) {
    // Recovery code path (hashed, one-time use)
    const hash = createHash("sha256").update(code.toUpperCase()).digest("hex");
    const [rc] = await db
      .select()
      .from(recoveryCodes)
      .where(
        and(
          eq(recoveryCodes.userId, user.id),
          eq(recoveryCodes.codeHash, hash),
          isNull(recoveryCodes.usedAt),
        ),
      )
      .limit(1);
    if (rc) {
      await db
        .update(recoveryCodes)
        .set({ usedAt: new Date() })
        .where(eq(recoveryCodes.id, rc.id));
      valid = true;
      usedRecovery = true;
    }
  }

  if (!valid) {
    await audit({ userId: user.id, event: "login_totp_failed", req });
    return NextResponse.json(
      { ok: false, error: "Código inválido. Confira o horário do celular." },
      { status: 401 },
    );
  }

  await db.delete(totpChallenges).where(eq(totpChallenges.id, challengeId));
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
  await audit({
    userId: user.id,
    event: usedRecovery ? "login_success_recovery_code" : "login_success_totp",
    req,
  });
  return res;
}
