import { NextResponse } from "next/server";
import { requireUser, audit } from "@/lib/auth";
import { zerarCustoPlaces } from "@/lib/places-cost";
import { zerarCustoAnthropic } from "@/lib/anthropic-cost";

export const dynamic = "force-dynamic";

/**
 * Zera um dos contadores internos de custo mostrados em Configurações:
 * "places" (requisições ao Google Places) ou "anthropic" (tokens da IA).
 * Não mexe em nada nas faturas reais da Google/Anthropic.
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  let body: { which?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const which = body.which;
  if (which !== "places" && which !== "anthropic")
    return NextResponse.json({ ok: false, error: "Campo inválido." }, { status: 400 });

  if (which === "places") await zerarCustoPlaces();
  else await zerarCustoAnthropic();

  await audit({ userId: auth.user.id, event: `cost_reset_${which}`, req });
  return NextResponse.json({ ok: true, which });
}
