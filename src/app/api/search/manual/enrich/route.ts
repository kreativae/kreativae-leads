import { NextResponse } from "next/server";
import { enrichFromWebsite } from "@/lib/enrich";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Mesma varredura de "Enriquecer lead" (e-mail, WhatsApp, redes, dono no
 * site), mas sem lead — o candidato ainda nem foi adicionado. O resultado
 * fica só na tela até o usuário revisar e clicar em Adicionar.
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  let body: { website?: unknown; country?: unknown };
  try {
    body = (await req.json()) as { website?: unknown; country?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const website = typeof body.website === "string" ? body.website.trim() : "";
  if (!website)
    return NextResponse.json({ ok: false, error: "Informe um site." }, { status: 400 });
  const country = body.country === "PT" ? "PT" : "BR";

  const result = await enrichFromWebsite(website, country);
  if (result.pagesScanned.length === 0)
    return NextResponse.json(
      { ok: false, error: "Não foi possível acessar o site para extrair dados." },
      { status: 502 },
    );

  return NextResponse.json({ ok: true, result });
}
