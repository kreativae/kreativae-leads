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

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireUser();
  if (auth.error) return auth.error;

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
      onUploadCompleted: async () => {
        // Nada a fazer aqui: o front so chama a Meta depois que ja tem a
        // URL do blob de volta.
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha no upload." },
      { status: 400 },
    );
  }
}
