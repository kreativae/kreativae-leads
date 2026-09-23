import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/settings-db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Ordem do menu lateral — compartilhada entre aparelhos (nao por
 * navegador, como o tema), por isso um endpoint proprio e leve em vez de
 * ir junto do /api/settings geral, que carrega custo/contas/etc a toa
 * numa tela que renderiza em toda navegacao.
 */
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const raw = await getSetting("nav_order");
  let order: string[] | null = null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) order = parsed;
    } catch {
      /* valor salvo corrompido — trata como se nao houvesse ordem salva */
    }
  }
  return NextResponse.json({ ok: true, order });
}

export async function PUT(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  let body: { order?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  if (!Array.isArray(body.order) || !body.order.every((v) => typeof v === "string"))
    return NextResponse.json({ ok: false, error: "Ordem inválida." }, { status: 400 });

  await setSetting("nav_order", JSON.stringify(body.order));
  return NextResponse.json({ ok: true });
}
