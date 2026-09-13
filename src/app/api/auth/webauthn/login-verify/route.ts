import { NextResponse } from "next/server";
import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { db } from "@/db";
import { totpChallenges, users, webauthnCredentials } from "@/db/schema";
import { eq } from "drizzle-orm";
import { audit, createSession, setSessionCookie } from "@/lib/auth";
import { rpFromRequest } from "@/lib/webauthn";
import { assertSameOrigin, clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!assertSameOrigin(req))
    return NextResponse.json({ ok: false, error: "Origem inválida." }, { status: 403 });

  const ip = clientIp(req);
  const limited = rateLimit(`webauthn-verify:ip:${ip}`, 20, 10 * 60);
  if (limited !== null)
    return NextResponse.json(
      { ok: false, error: `Muitas tentativas. Aguarde ${Math.ceil(limited / 60)} min.` },
      { status: 429 },
    );

  let body: { challengeId?: unknown; response?: AuthenticationResponseJSON };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const challengeId = typeof body.challengeId === "string" ? body.challengeId : "";
  if (!challengeId || !body.response)
    return NextResponse.json({ ok: false, error: "Dados ausentes." }, { status: 400 });

  const [challenge] = await db
    .select()
    .from(totpChallenges)
    .where(eq(totpChallenges.id, challengeId))
    .limit(1);
  if (!challenge || challenge.expiresAt.getTime() <= Date.now() || !challenge.webauthnChallenge)
    return NextResponse.json(
      { ok: false, error: "Sessão de verificação expirada. Faça login novamente." },
      { status: 401 },
    );

  const [cred] = await db
    .select()
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.credentialId, body.response.id))
    .limit(1);
  if (!cred || cred.userId !== challenge.userId)
    return NextResponse.json({ ok: false, error: "Chave de acesso desconhecida." }, { status: 401 });

  const { rpID, origin } = rpFromRequest(req);
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: challenge.webauthnChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.credentialId,
        publicKey: new Uint8Array(Buffer.from(cred.publicKey, "base64url")),
        counter: cred.counter,
        transports: cred.transports ? cred.transports.split(",") : undefined,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Falha na verificação." },
      { status: 400 },
    );
  }

  if (!verification.verified)
    return NextResponse.json({ ok: false, error: "Não foi possível verificar." }, { status: 401 });

  const [user] = await db.select().from(users).where(eq(users.id, challenge.userId)).limit(1);
  if (!user) return NextResponse.json({ ok: false, error: "Usuário não encontrado." }, { status: 404 });

  await db
    .update(webauthnCredentials)
    .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(eq(webauthnCredentials.id, cred.id));
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
  await audit({ userId: user.id, event: "login_success_webauthn", req, detail: cred.label });
  return res;
}
