import { NextResponse } from "next/server";
import { requireOwner, audit } from "@/lib/auth";
import { getSetting, getWaAccount, type SettingKey } from "@/lib/settings-db";

export const dynamic = "force-dynamic";

const REVEALABLE_SETTINGS: SettingKey[] = ["google_places_key", "wa_app_secret", "ig_access_token"];

/**
 * Mostra o valor real de um segredo — normalmente a UI só devolve uma
 * versão mascarada. Só o proprietário da conta pode chamar, e cada
 * revelação fica registrada em audit_logs (quem, quando, qual campo).
 */
export async function POST(req: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;

  let body: { kind?: unknown; key?: unknown; id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  if (body.kind === "setting") {
    const key = REVEALABLE_SETTINGS.find((k) => k === body.key);
    if (!key)
      return NextResponse.json({ ok: false, error: "Campo inválido." }, { status: 400 });
    const value = await getSetting(key);
    await audit({
      userId: auth.user.id,
      event: "secret_revealed",
      req,
      detail: `setting:${key}`,
    });
    return NextResponse.json({ ok: true, value });
  }

  if (body.kind === "wa_account") {
    const id = typeof body.id === "string" ? body.id : "";
    const conta = id ? await getWaAccount(id) : null;
    if (!conta)
      return NextResponse.json({ ok: false, error: "Conta não encontrada." }, { status: 404 });
    await audit({
      userId: auth.user.id,
      event: "secret_revealed",
      req,
      detail: `wa_account:${conta.label}`,
    });
    return NextResponse.json({ ok: true, value: conta.accessToken });
  }

  return NextResponse.json({ ok: false, error: "Tipo inválido." }, { status: 400 });
}
