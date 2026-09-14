export interface WaSendResult {
  ok: boolean;
  waMessageId?: string;
  error?: string;
}

const GRAPH_VERSION = "v21.0";

/**
 * Templates aprovados pela Meta, um por idioma — criados no WhatsApp Manager
 * em 13/09/2026 (contas separadas: Brasil e Portugal). Nome e idioma têm que
 * bater exatamente com o que a Meta salvou, ou o envio é rejeitado. Cabeçalho
 * e corpo dos dois usam {{1}} = nome da empresa.
 */
export const WA_TEMPLATES: Record<
  "BR" | "PT",
  { name: string; language: string; bodyTemplate: string }
> = {
  BR: {
    name: "modelo_br",
    language: "pt_BR",
    bodyTemplate:
      "Olá! Sou da Kreativ.ae, estúdio de criação de sites. Vi a {{empresa}} e percebi que dá pra melhorar bastante a forma como o negócio aparece online. Topa ver algumas ideias rápidas, sem compromisso?",
  },
  PT: {
    name: "modelo_pt",
    language: "pt_PT",
    bodyTemplate:
      "Olá! Sou da Kreativ.ae, estúdio especializado na criação de sites profissionais. Reparei que há espaço para melhorar a forma como a {{empresa}} aparece online. Topa ver algumas ideias rápidas, sem qualquer compromisso?",
  },
};

/** Texto real que o template manda, pra registrar em Conversas — nao a Abordagem pronta, que e outra redacao. */
export function renderWaTemplateBody(locale: "BR" | "PT", companyName: string): string {
  return WA_TEMPLATES[locale].bodyTemplate.replace("{{empresa}}", companyName);
}

/** Sends an approved Meta message template — the only way to start a WhatsApp conversation cold. */
export async function sendWaTemplate(opts: {
  accessToken: string;
  phoneNumberId: string;
  to: string; // digits with country code
  templateName: string;
  languageCode: string;
  headerParam: string;
  bodyParam: string;
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
        type: "template",
        template: {
          name: opts.templateName,
          language: { code: opts.languageCode },
          components: [
            { type: "header", parameters: [{ type: "text", text: opts.headerParam }] },
            { type: "body", parameters: [{ type: "text", text: opts.bodyParam }] },
          ],
        },
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
    error?: {
      message?: string;
      error_subcode?: number;
      error_user_title?: string;
      error_user_msg?: string;
      error_data?: { details?: string };
      fbtrace_id?: string;
    };
  };

  if (!res.ok || data.error) {
    return {
      ok: false,
      error: erroDetalhado(data.error, res.status),
    };
  }
  return { ok: true, waMessageId: data.messages?.[0]?.id };
}

/**
 * "(#100) Invalid parameter" sozinho nao diz nada — o motivo real quase
 * sempre esta em error_data.details ou error_user_msg. Junta tudo que a
 * Meta mandar, pra nao precisar reproduzir o erro so pra ver o detalhe.
 */
function erroDetalhado(
  error:
    | {
        message?: string;
        error_subcode?: number;
        error_user_title?: string;
        error_user_msg?: string;
        error_data?: { details?: string };
        fbtrace_id?: string;
      }
    | undefined,
  httpStatus: number,
): string {
  if (!error) return `Meta respondeu HTTP ${httpStatus}.`;
  const partes = [
    error.message,
    error.error_data?.details,
    error.error_user_title,
    error.error_user_msg,
    error.error_subcode ? `subcode ${error.error_subcode}` : null,
    error.fbtrace_id ? `trace ${error.fbtrace_id}` : null,
  ].filter((p): p is string => !!p && p.trim().length > 0);
  return partes.length > 0 ? partes.join(" — ") : `Meta respondeu HTTP ${httpStatus}.`;
}

/** Confere token + Phone Number ID sem enviar nada — so uma leitura, sem custo. */
export async function checkWaAccount(opts: {
  accessToken: string;
  phoneNumberId: string;
}): Promise<{ ok: true; displayPhone: string | null } | { ok: false; error: string }> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${opts.phoneNumberId}?fields=display_phone_number`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${opts.accessToken}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Sem conexão com o servidor da Meta." };
  }
  const data = (await res.json().catch(() => ({}))) as {
    display_phone_number?: string;
    error?: { message?: string };
  };
  if (!res.ok || data.error)
    return { ok: false, error: data.error?.message ?? `Meta respondeu HTTP ${res.status}.` };
  return { ok: true, displayPhone: data.display_phone_number ?? null };
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
