import { put } from "@vercel/blob";

/**
 * Sobe um arquivo pro Vercel Blob e devolve a URL publica. Usado tanto pra
 * midia recebida (a URL da Meta expira em minutos, guardamos copia nossa)
 * quanto pra midia enviada (a Cloud API busca o arquivo por URL, entao
 * precisa estar publicamente acessivel antes do envio).
 */
export async function uploadToBlob(opts: {
  bytes: ArrayBuffer;
  contentType: string;
  filename: string;
}): Promise<string> {
  const nomeSeguro = opts.filename.replace(/[^A-Za-z0-9._-]/g, "_").slice(-120) || "arquivo";
  const blob = await put(`wa-media/${crypto.randomUUID()}-${nomeSeguro}`, Buffer.from(opts.bytes), {
    access: "public",
    contentType: opts.contentType,
    addRandomSuffix: false,
  });
  return blob.url;
}
