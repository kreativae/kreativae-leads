import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Remove o print do Blob quando o candidato é descartado — evita acumular lixo de storage. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  let body: { url?: unknown };
  try {
    body = (await req.json()) as { url?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const url = typeof body.url === "string" ? body.url : "";
  if (!url) return NextResponse.json({ ok: false, error: "Informe a URL." }, { status: 400 });

  try {
    await del(url);
  } catch {
    // Já pode ter sido removido antes — não trava o descarte no front por isso.
  }
  return NextResponse.json({ ok: true });
}
