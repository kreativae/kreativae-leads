export interface WaSendResult {
  ok: boolean;
  waMessageId?: string;
  error?: string;
}

const GRAPH_VERSION = "v21.0";

/** Sends a free-form text message via WhatsApp Business Cloud API. */
export async function sendWaText(opts: {
  accessToken: string;
  phoneNumberId: string;
  to: string; // digits with country code
  body: string;
}): Promise<WaSendResult> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${opts.phoneNumberId}/messages`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: opts.to,
        type: "text",
        text: { preview_url: true, body: opts.body },
      }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Sem conexão com o servidor da Meta." };
  }

  const data = (await res.json().catch(() => ({}))) as {
    messages?: { id?: string }[];
    error?: { message?: string };
  };

  if (!res.ok || data.error) {
    return {
      ok: false,
      error: data.error?.message ?? `Meta respondeu HTTP ${res.status}.`,
    };
  }
  return { ok: true, waMessageId: data.messages?.[0]?.id };
}

/** Tipos de midia que o Cloud API aceita enviar/receber via mensagem. */
export type WaMediaType = "image" | "document" | "audio" | "video" | "sticker";

export function waMediaTypeFromMime(mime: string): WaMediaType {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

/**
 * Envia midia por URL publica (a Cloud API busca o arquivo nessa URL na hora
 * do envio) — mais simples que o fluxo de upload em duas etapas da Meta, e
 * reaproveita a mesma URL do Blob que ja hospedamos o arquivo.
 */
export async function sendWaMedia(opts: {
  accessToken: string;
  phoneNumberId: string;
  to: string;
  type: WaMediaType;
  link: string;
  caption?: string;
  filename?: string;
}): Promise<WaSendResult> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${opts.phoneNumberId}/messages`;
  const mediaObj: Record<string, string> = { link: opts.link };
  if (opts.caption && (opts.type === "image" || opts.type === "video" || opts.type === "document"))
    mediaObj.caption = opts.caption;
  if (opts.filename && opts.type === "document") mediaObj.filename = opts.filename;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: opts.to,
        type: opts.type,
        [opts.type]: mediaObj,
      }),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Sem conexão com o servidor da Meta." };
  }

  const data = (await res.json().catch(() => ({}))) as {
    messages?: { id?: string }[];
    error?: { message?: string };
  };

  if (!res.ok || data.error) {
    return {
      ok: false,
      error: data.error?.message ?? `Meta respondeu HTTP ${res.status}.`,
    };
  }
  return { ok: true, waMessageId: data.messages?.[0]?.id };
}

export interface WaMediaMeta {
  ok: boolean;
  url?: string;
  mimeType?: string;
  error?: string;
}

/** Consulta os metadados de uma midia recebida — a URL devolvida expira em minutos e exige o mesmo access token pra baixar. */
export async function getWaMediaMeta(opts: {
  accessToken: string;
  mediaId: string;
}): Promise<WaMediaMeta> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${opts.mediaId}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${opts.accessToken}` },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as {
      url?: string;
      mime_type?: string;
      error?: { message?: string };
    };
    if (!res.ok || data.error || !data.url)
      return { ok: false, error: data.error?.message ?? `HTTP ${res.status}` };
    return { ok: true, url: data.url, mimeType: data.mime_type };
  } catch {
    return { ok: false, error: "Sem conexão com o servidor da Meta." };
  }
}

/** Baixa os bytes de uma midia recebida (URL temporaria de getWaMediaMeta). */
export async function downloadWaMedia(opts: {
  accessToken: string;
  url: string;
}): Promise<{ ok: true; bytes: ArrayBuffer } | { ok: false; error: string }> {
  try {
    const res = await fetch(opts.url, {
      headers: { Authorization: `Bearer ${opts.accessToken}` },
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status} ao baixar mídia.` };
    return { ok: true, bytes: await res.arrayBuffer() };
  } catch {
    return { ok: false, error: "Sem conexão com o servidor da Meta." };
  }
}
