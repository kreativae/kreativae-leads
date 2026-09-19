import { NextResponse } from "next/server";
import { requireOwner, requireUser, audit } from "@/lib/auth";
import { isDebugEasterEggEnabled, isDebugPanelEnabled, setSetting } from "@/lib/settings-db";

export const dynamic = "force-dynamic";

const CAMPOS = {
  panel: {
    key: "debug_panel_enabled",
    eventoLigar: "debug_panel_enabled",
    eventoDesligar: "debug_panel_disabled",
  },
  easter_egg: {
    key: "debug_easter_egg_enabled",
    eventoLigar: "debug_easter_egg_enabled",
    eventoDesligar: "debug_easter_egg_disabled",
  },
} as const;

/**
 * Dois interruptores independentes: "panel" liga/desliga o painel de debug
 * inteiro (FAB incluído); "easter_egg" liga/desliga só o ícone escondido +
 * sequência secreta em Configurações. O FAB sempre exige a mesma sequência
 * secreta — não existe mais atalho de acesso direto pro dono. Qualquer
 * usuário logado pode LER (Configurações precisa saber o que mostrar), só o
 * proprietário MUDA.
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
  const which = body.which;
  if (which !== "panel" && which !== "easter_egg")
    return NextResponse.json({ ok: false, error: "Campo inválido." }, { status: 400 });

  const enabled = body.enabled !== false;
  const campo = CAMPOS[which];
  await setSetting(campo.key, enabled ? null : "no");
  await audit({
    userId: auth.user.id,
    event: enabled ? campo.eventoLigar : campo.eventoDesligar,
    req,
  });
  return NextResponse.json({ ok: true, which, enabled });
}
