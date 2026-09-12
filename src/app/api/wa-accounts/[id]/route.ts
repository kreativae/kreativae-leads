import { NextResponse } from "next/server";
import { getWaAccount, updateWaAccount, deleteWaAccount, maskSecret } from "@/lib/settings-db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  const atual = await getWaAccount(id);
  if (!atual)
    return NextResponse.json({ ok: false, error: "Conta não encontrada." }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const patch: Partial<{
    label: string;
    phoneNumberId: string;
    wabaId: string | null;
    accessToken: string;
    displayPhone: string | null;
  }> = {};

  if (typeof body.label === "string" && body.label.trim()) patch.label = body.label.trim();
  if (typeof body.phoneNumberId === "string" && body.phoneNumberId.trim())
    patch.phoneNumberId = body.phoneNumberId.trim();
  // Token vazio ou mascarado (####1234) mantem o que ja estava salvo — mesma
  // convencao dos outros segredos do sistema.
  if (typeof body.accessToken === "string" && body.accessToken.trim() && !body.accessToken.startsWith("••••"))
    patch.accessToken = body.accessToken.trim();
  if (body.wabaId === null || (typeof body.wabaId === "string"))
    patch.wabaId = typeof body.wabaId === "string" && body.wabaId.trim() ? body.wabaId.trim() : null;
  if (body.displayPhone === null || typeof body.displayPhone === "string")
    patch.displayPhone =
      typeof body.displayPhone === "string" && body.displayPhone.trim()
        ? body.displayPhone.trim()
        : null;

  try {
    const conta = await updateWaAccount(id, patch);
    if (!conta)
      return NextResponse.json({ ok: false, error: "Conta não encontrada." }, { status: 404 });
    return NextResponse.json({
      ok: true,
      account: {
        id: conta.id,
        label: conta.label,
        phoneNumberId: conta.phoneNumberId,
        wabaId: conta.wabaId,
        displayPhone: conta.displayPhone,
        accessTokenMasked: maskSecret(conta.accessToken),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    const duplicada = msg.includes("wa_accounts_phone_number_id_key");
    return NextResponse.json(
      { ok: false, error: duplicada ? "Já existe uma conta com esse Phone Number ID." : "Não foi possível salvar." },
      { status: duplicada ? 409 : 500 },
    );
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  await deleteWaAccount(id);
  return NextResponse.json({ ok: true });
}
