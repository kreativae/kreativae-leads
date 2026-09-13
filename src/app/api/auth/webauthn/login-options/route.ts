import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { db } from "@/db";
import { totpChallenges, webauthnCredentials } from "@/db/schema";
import { eq } from "drizzle-orm";
import { rpFromRequest } from "@/lib/webauthn";
import { assertSameOrigin, clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!assertSameOrigin(req))
    return NextResponse.json({ ok: false, error: "Origem inválida." }, { status: 403 });

  const ip = clientIp(req);
  const limited = rateLimit(`webauthn-opts:ip:${ip}`, 30, 10 * 60);
  if (limited !== null)
    return NextResponse.json(
      { ok: false, error: `Muitas tentativas. Aguarde ${Math.ceil(limited / 60)} min.` },
      { status: 429 },
    );

  let body: { challengeId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const challengeId = typeof body.challengeId === "string" ? body.challengeId : "";

  const [challenge] = await db
    .select()
    .from(totpChallenges)
    .where(eq(totpChallenges.id, challengeId))
    .limit(1);
  if (!challenge || challenge.expiresAt.getTime() <= Date.now())
    return NextResponse.json(
      { ok: false, error: "Sessão de verificação expirada. Faça login novamente." },
      { status: 401 },
    );

  const creds = await db
    .select({ credentialId: webauthnCredentials.credentialId, transports: webauthnCredentials.transports })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, challenge.userId));
  if (creds.length === 0)
    return NextResponse.json(
      { ok: false, error: "Nenhuma chave de acesso cadastrada para esta conta." },
      { status: 400 },
    );

  const { rpID } = rpFromRequest(req);
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: creds.map((c) => ({
      id: c.credentialId,
      transports: c.transports ? c.transports.split(",") : undefined,
    })),
    userVerification: "preferred",
  });

  await db
    .update(totpChallenges)
    .set({ webauthnChallenge: options.challenge })
    .where(eq(totpChallenges.id, challengeId));

  return NextResponse.json({ ok: true, options });
}
