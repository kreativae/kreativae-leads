import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { excluirBusca, limparHistorico, listarHistorico } from "@/lib/comandos-historico";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  return NextResponse.json({ ok: true, buscas: await listarHistorico() });
}

/** Remove uma busca ({ id }) ou o histórico inteiro ({ tudo: true }). */
export async function DELETE(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  let body: { id?: unknown; tudo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  if (body.tudo === true) await limparHistorico();
  else if (typeof body.id === "string" && /^[0-9a-f]{20}$/.test(body.id)) await excluirBusca(body.id);
  else return NextResponse.json({ ok: false, error: "Busca inválida." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
