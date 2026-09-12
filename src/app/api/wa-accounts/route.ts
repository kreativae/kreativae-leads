import { NextResponse } from "next/server";
import { listWaAccounts, createWaAccount, maskSecret } from "@/lib/settings-db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

function semSegredo(a: Awaited<ReturnType<typeof listWaAccounts>>[number]) {
  return {
    id: a.id,
    label: a.label,
    phoneNumberId: a.phoneNumberId,
    wabaId: a.wabaId,
    displayPhone: a.displayPhone,
    accessTokenMasked: maskSecret(a.accessToken),
  };
}

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const contas = await listWaAccounts();
  return NextResponse.json({ accounts: contas.map(semSegredo) });
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const label = typeof body.label === "string" ? body.label.trim() : "";
  const phoneNumberId = typeof body.phoneNumberId === "string" ? body.phoneNumberId.trim() : "";
  const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
  const wabaId = typeof body.wabaId === "string" && body.wabaId.trim() ? body.wabaId.trim() : null;
  const displayPhone =
    typeof body.displayPhone === "string" && body.displayPhone.trim()
      ? body.displayPhone.trim()
      : null;

  if (!label) return NextResponse.json({ ok: false, error: "Dê um nome para a conta (ex.: Brasil)." }, { status: 400 });
  if (!phoneNumberId)
    return NextResponse.json({ ok: false, error: "Phone Number ID é obrigatório." }, { status: 400 });
  if (!accessToken)
    return NextResponse.json({ ok: false, error: "Access Token é obrigatório." }, { status: 400 });

  try {
    const conta = await createWaAccount({ label, phoneNumberId, wabaId, accessToken, displayPhone });
    return NextResponse.json({ ok: true, account: semSegredo(conta) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    const duplicada = msg.includes("wa_accounts_phone_number_id_key");
    return NextResponse.json(
      {
        ok: false,
        error: duplicada
          ? "Já existe uma conta com esse Phone Number ID."
          : "Não foi possível salvar a conta.",
      },
      { status: duplicada ? 409 : 500 },
    );
  }
}
