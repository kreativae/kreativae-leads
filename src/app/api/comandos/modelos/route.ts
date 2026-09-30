import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  criarModelo,
  excluirModelo,
  listarModelos,
  registrarUsoModelo,
  sanitizarInput,
} from "@/lib/comandos-modelos";

export const dynamic = "force-dynamic";

async function lerCorpo(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const jsonInvalido = () =>
  NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
const naoEncontrado = () =>
  NextResponse.json({ ok: false, error: "Modelo não encontrado." }, { status: 404 });

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  return NextResponse.json({ ok: true, modelos: await listarModelos() });
}

/** Salva um novo modelo: { nome, input }. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const body = await lerCorpo(req);
  if (!body) return jsonInvalido();
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  if (!nome) return NextResponse.json({ ok: false, error: "Dê um nome ao modelo." }, { status: 400 });
  const modelo = await criarModelo(nome, sanitizarInput(body.input));
  return NextResponse.json({ ok: true, modelo });
}

/** Conta um uso (a pessoa abriu o comando no Google com esse modelo carregado): { id }. */
export async function PATCH(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const body = await lerCorpo(req);
  if (!body || typeof body.id !== "string") return jsonInvalido();
  return (await registrarUsoModelo(body.id)) ? NextResponse.json({ ok: true }) : naoEncontrado();
}

/** Remove um modelo: { id }. */
export async function DELETE(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const body = await lerCorpo(req);
  if (!body || typeof body.id !== "string") return jsonInvalido();
  return (await excluirModelo(body.id)) ? NextResponse.json({ ok: true }) : naoEncontrado();
}
