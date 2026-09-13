import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { getEffectiveSetting, getIgConfig, getWaAccount } from "@/lib/settings-db";
import { testPlacesKey } from "@/lib/places";
import { registrarRequisicoesPlaces } from "@/lib/places-cost";
import { checkIgToken } from "@/lib/instagram";
import { checkWaAccount } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/** Testa uma credencial contra a API real, sem passar pelo fluxo de negócio inteiro. */
export async function POST(req: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;

  let body: { kind?: unknown; id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  if (body.kind === "google_places_key") {
    const key = await getEffectiveSetting("google_places_key", "GOOGLE_PLACES_API_KEY");
    if (!key) return NextResponse.json({ ok: false, error: "Chave não configurada." });
    const r = await testPlacesKey(key);
    if (r.ok) await registrarRequisicoesPlaces(1);
    return NextResponse.json(r.ok ? { ok: true, detail: "Chave autenticou normalmente." } : r);
  }

  if (body.kind === "ig_access_token") {
    const config = await getIgConfig();
    if (!config) return NextResponse.json({ ok: false, error: "Instagram não configurado." });
    const r = await checkIgToken(config);
    return NextResponse.json(
      r.ok ? { ok: true, detail: `Token válido (conta: @${r.username ?? "?"}).` } : r,
    );
  }

  if (body.kind === "wa_account") {
    const id = typeof body.id === "string" ? body.id : "";
    const conta = id ? await getWaAccount(id) : null;
    if (!conta) return NextResponse.json({ ok: false, error: "Conta não encontrada." });
    const r = await checkWaAccount(conta);
    return NextResponse.json(
      r.ok ? { ok: true, detail: `Token válido (número: ${r.displayPhone ?? conta.phoneNumberId}).` } : r,
    );
  }

  return NextResponse.json({ ok: false, error: "Tipo inválido." }, { status: 400 });
}
