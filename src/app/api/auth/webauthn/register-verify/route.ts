import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { db } from "@/db";
import { webauthnCredentials } from "@/db/schema";
import { requireUser, audit } from "@/lib/auth";
import { rpFromRequest } from "@/lib/webauthn";
import { assertSameOrigin } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  if (!assertSameOrigin(req))
    return NextResponse.json({ ok: false, error: "Origem inválida." }, { status: 403 });

  const cookieStore = await cookies();
  const challenge = cookieStore.get("webauthn_reg_challenge")?.value;
  if (!challenge)
    return NextResponse.json(
      { ok: false, error: "Sessão de cadastro expirada. Tente de novo." },
      { status: 400 },
    );

  let body: { response?: RegistrationResponseJSON; label?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  if (!body.response)
    return NextResponse.json({ ok: false, error: "Resposta ausente." }, { status: 400 });

  const { rpID, origin } = rpFromRequest(req);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Falha na verificação." },
      { status: 400 },
    );
  }

  if (!verification.verified || !verification.registrationInfo)
    return NextResponse.json({ ok: false, error: "Não foi possível verificar o dispositivo." }, { status: 400 });

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 60) : "Chave de acesso";

  await db.insert(webauthnCredentials).values({
    userId: auth.user.id,
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp ? "yes" : "no",
    transports: credential.transports?.join(",") ?? null,
    label,
  });

  await audit({ userId: auth.user.id, event: "webauthn_registered", req, detail: label });

  const res = NextResponse.json({ ok: true });
  res.cookies.delete("webauthn_reg_challenge");
  return res;
}
