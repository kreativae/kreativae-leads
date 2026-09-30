import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Tipos que a Cloud API do WhatsApp aceita enviar (imagem, video, audio,
// documento). O browser sobe o arquivo direto pro Blob usando o token que
// esta rota emite — os bytes nunca passam pela nossa funcao serverless,
// entao nao caem no limite de payload da Vercel.
const TIPOS_PERMITIDOS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/3gpp",
  "audio/mpeg",
  "audio/ogg",
  "audio/mp4",
  "audio/aac",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "text/plain",
  "text/csv",
];

/**
 * O que está errado com o Vercel Blob, em português — ou null se nada.
 * Quando esta rota falha, o upload() do navegador só mostra "Failed to
 * retrieve the client token" e esconde o motivo; o GET abaixo devolve este
 * diagnóstico pra tela mostrar o que de fato precisa ser consertado.
 */
function problemaDoBlob(): string | null {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token)
    return "O armazenamento de imagens (Vercel Blob) não está conectado: falta a variável BLOB_READ_WRITE_TOKEN no projeto da Vercel. Em vercel.com → projeto → Storage, conecte (ou crie) um Blob store e faça um novo deploy.";
  // Mesma checagem da própria @vercel/blob: vercel_blob_rw_<storeId>_<segredo>.
  if (!token.split("_")[3])
    return "A variável BLOB_READ_WRITE_TOKEN da Vercel está com um valor inválido (esperado: vercel_blob_rw_…). Reconecte o Blob store em vercel.com → projeto → Storage e faça um novo deploy.";
  return null;
}

/** Diagnóstico pra tela quando o upload falha sem dizer por quê. */
export async function GET(): Promise<NextResponse> {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const problema = problemaDoBlob();
  return NextResponse.json(problema ? { ok: false, error: problema } : { ok: true });
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const problema = problemaDoBlob();
  if (problema) {
    console.error(`[blob-upload] ${problema}`);
    return NextResponse.json({ error: problema }, { status: 500 });
  }

  const body = (await request.json()) as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: TIPOS_PERMITIDOS,
        addRandomSuffix: true,
        maximumSizeInBytes: 64 * 1024 * 1024, // 64MB — cobre imagem/audio/video/documento comuns
      }),
      // Sem onUploadCompleted de proposito: o front ja recebe a URL do blob
      // de volta, e o callback da Vercel pra esta rota chegaria sem cookie de
      // sessao — o middleware responderia 401 a toda chamada.
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    console.error("[blob-upload]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha no upload." },
      { status: 400 },
    );
  }
}
