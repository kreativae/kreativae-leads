import { NextResponse } from "next/server";
import { analyzeWebsite } from "@/lib/site-analyzer";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Mesma análise de "Analisar o site agora", mas sem lead — o candidato ainda
 * nem foi adicionado. O resultado fica só na tela até o usuário clicar em
 * Adicionar, que aí sim grava tudo junto com o lead.
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  let body: { website?: unknown };
  try {
    body = (await req.json()) as { website?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const website = typeof body.website === "string" ? body.website.trim() : "";
  if (!website)
    return NextResponse.json({ ok: false, error: "Informe um site." }, { status: 400 });

  const analysis = await analyzeWebsite(website);
  return NextResponse.json({ ok: true, analysis });
}
