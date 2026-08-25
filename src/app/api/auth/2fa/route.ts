import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { db } from "@/db";
import { recoveryCodes, sessions, users } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { audit, requireUser } from "@/lib/auth";
import { newTotpSecret, totpUri, verifyTotp } from "@/lib/totp";
import { verifyPassword } from "@/lib/password";
import { assertSameOrigin } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Step 1: generate a TOTP secret (not yet enabled until verified). */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  if (!assertSameOrigin(req))
    return NextResponse.json({ ok: false, error: "Origem inválida." }, { status: 403 });

  let body: { action?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* empty → setup */
  }

  if (body.action === "disable") {
    const b = body as { password?: unknown; code?: unknown };
    const password = typeof b.password === "string" ? b.password : "";
    const code = typeof b.code === "string" ? b.code.replace(/\s+/g, "") : "";
    const [user] = await db.select().from(users).where(eq(users.id, auth.user.id)).limit(1);
    if (!user) return NextResponse.json({ ok: false, error: "Usuário não encontrado." }, { status: 404 });
    if (user.totpEnabled !== "yes" || !user.totpSecret)
      return NextResponse.json({ ok: false, error: "2FA não está ativo." }, { status: 400 });

    const [pwOk, totpOk] = await Promise.all([
      verifyPassword(password, user.passwordHash),
      Promise.resolve(verifyTotp(user.totpSecret, code)),
    ]);
    if (!pwOk || !totpOk)
      return NextResponse.json(
        { ok: false, error: "Senha ou código 2FA incorretos." },
        { status: 401 },
      );

    await db
      .update(users)
      .set({ totpEnabled: "no", totpSecret: null })
      .where(eq(users.id, user.id));
    await db.delete(recoveryCodes).where(eq(recoveryCodes.userId, user.id));
    await db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, auth.user.sessionId)));
    await audit({ userId: user.id, event: "totp_disabled", req });
    return NextResponse.json({ ok: true });
  }

  const secret = await newTotpSecret();
  await db.update(users).set({ totpSecret: secret }).where(eq(users.id, auth.user.id));
  return NextResponse.json({ ok: true, secret, uri: totpUri(secret, auth.user.email) });
}

/** Step 2: confirm a code from the authenticator app → enable 2FA. */
export async function PUT(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  if (!assertSameOrigin(req))
    return NextResponse.json({ ok: false, error: "Origem inválida." }, { status: 403 });

  let body: { code?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code.replace(/\s+/g, "") : "";

  const [user] = await db.select().from(users).where(eq(users.id, auth.user.id)).limit(1);
  if (!user?.totpSecret)
    return NextResponse.json(
      { ok: false, error: "Inicie a configuração primeiro." },
      { status: 400 },
    );
  if (!verifyTotp(user.totpSecret, code))
    return NextResponse.json({ ok: false, error: "Código inválido." }, { status: 401 });

  await db.update(users).set({ totpEnabled: "yes" }).where(eq(users.id, user.id));

  // Fresh 8 one-time recovery codes (hashed at rest)
  await db.delete(recoveryCodes).where(eq(recoveryCodes.userId, user.id));
  const codes: string[] = [];
  const rows: { userId: string; codeHash: string }[] = [];
  for (let i = 0; i < 8; i++) {
    const raw = randomBytes(4).toString("hex").toUpperCase();
    const pretty = `${raw.slice(0, 4)}-${raw.slice(4)}`;
    codes.push(pretty);
    rows.push({
      userId: user.id,
      codeHash: createHash("sha256").update(raw).digest("hex"),
    });
  }
  await db.insert(recoveryCodes).values(rows);

  // Enabling 2FA revokes other sessions (fresh trust boundary).
  await db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, auth.user.sessionId)));
  await audit({ userId: user.id, event: "totp_enabled", req });
  return NextResponse.json({ ok: true, recoveryCodes: codes });
}
