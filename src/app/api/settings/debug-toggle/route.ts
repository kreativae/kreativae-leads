import { NextResponse } from "next/server";
import { requireOwner, requireUser, audit } from "@/lib/auth";
import { isDebugEasterEggEnabled, setSetting } from "@/lib/settings-db";

export const dynamic = "force-dynamic";

/**
 * Qualquer usuário logado pode LER o estado (Configurações precisa saber se
 * mostra o ícone/FAB), mas só o proprietário pode MUDAR — é ele quem decide
 * se esse acesso escondido existe ou não.
 */
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  return NextResponse.json({ ok: true, enabled: await isDebugEasterEggEnabled() });
}

export async function PUT(req: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;

  let body: { enabled?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const enabled = body.enabled !== false;
  await setSetting("debug_easter_egg_enabled", enabled ? null : "no");
  await audit({
    userId: auth.user.id,
    event: enabled ? "debug_easter_egg_enabled" : "debug_easter_egg_disabled",
    req,
  });
  return NextResponse.json({ ok: true, enabled });
}
