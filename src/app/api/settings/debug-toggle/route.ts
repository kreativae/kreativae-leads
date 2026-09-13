import { NextResponse } from "next/server";
import { requireOwner, requireUser, audit } from "@/lib/auth";
import { isDebugEasterEggEnabled, isDebugPanelEnabled, setSetting } from "@/lib/settings-db";

export const dynamic = "force-dynamic";

/**
 * Dois interruptores independentes: "panel" liga/desliga o painel de debug
 * inteiro (FAB incluído); "easter_egg" liga/desliga só o ícone escondido +
 * sequência secreta em Configurações. Qualquer usuário logado pode LER
 * (Configurações precisa saber o que mostrar), só o proprietário MUDA.
 */
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  return NextResponse.json({
    ok: true,
    panelEnabled: await isDebugPanelEnabled(),
    easterEggEnabled: await isDebugEasterEggEnabled(),
  });
}

export async function PUT(req: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;

  let body: { which?: unknown; enabled?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  if (body.which !== "panel" && body.which !== "easter_egg")
    return NextResponse.json({ ok: false, error: "Campo inválido." }, { status: 400 });

  const enabled = body.enabled !== false;
  const key = body.which === "panel" ? "debug_panel_enabled" : "debug_easter_egg_enabled";
  await setSetting(key, enabled ? null : "no");
  await audit({
    userId: auth.user.id,
    event:
      body.which === "panel"
        ? enabled
          ? "debug_panel_enabled"
          : "debug_panel_disabled"
        : enabled
          ? "debug_easter_egg_enabled"
          : "debug_easter_egg_disabled",
    req,
  });
  return NextResponse.json({ ok: true, which: body.which, enabled });
}
