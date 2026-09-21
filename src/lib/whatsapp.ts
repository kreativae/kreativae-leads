export interface WaSendResult {
  ok: boolean;
  waMessageId?: string;
  error?: string;
}

interface WaApiError {
  message?: string;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
  error_data?: { details?: string };
  fbtrace_id?: string;
}

const GRAPH_VERSION = "v21.0";

/**
 * Templates aprovados pela Meta ficam em Configurações → Automação (nome,
 * idioma e corpo editáveis por lá — settings-db.ts::getAutomationSettings),
 * nao aqui. Nome e idioma têm que bater exatamente com o que a Meta salvou,
 * ou o envio é rejeitado.
 */
export function renderWaTemplateBody(bodyTemplate: string, companyName: string): string {
  return bodyTemplate.replace("{{empresa}}", companyName);
}

/**
 * Sends an approved Meta message template — the only way to start a
 * WhatsApp conversation cold. "modelo_br"/"modelo_pt" (conferidos direto no
 * WhatsApp Manager) tem cabecalho de texto com 1 variavel ALEM da variavel
 * do corpo — os dois usam o nome da empresa. Um componente que o template
 * aprovado nao tem (ou que falta um que ele tem) derruba a chamada inteira
 * com "(#100) Invalid parameter".
 */
export async function sendWaTemplate(opts: {
  accessToken: string;
  phoneNumberId: string;
  to: string; // digits with country code
  templateName: string;
  languageCode: string;
  headerParam: string;
  /** null quando o corpo aprovado na Meta nao tem variavel nenhuma. */
  bodyParam: string | null;
}): Promise<WaSendResult> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${opts.phoneNumberId}/messages`;
  const components = [
    { type: "header", parameters: [{ type: "text", text: opts.headerParam }] },
    ...(opts.bodyParam
      ? [{ type: "body", parameters: [{ type: "text", text: opts.bodyParam }] }]
      : []),
  ];
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
          components,
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
    error?: WaApiError;
  };

  if (!res.ok || data.error) {
    return {
      ok: false,
      error: erroDetalhado(data.error, res.status),
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
    error?: WaApiError;
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
function erroDetalhado(error: WaApiError | undefined, httpStatus: number): string {
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
/** Qualidade da conta segundo a Meta — mesma escala do WhatsApp Manager. */
export type WaQualityRating = "GREEN" | "YELLOW" | "RED" | "UNKNOWN";

export interface WaAccountHealth {
  displayPhone: string | null;
  qualityRating: WaQualityRating | null;
  messagingLimitTier: string | null;
}

export async function checkWaAccount(opts: {
  accessToken: string;
  phoneNumberId: string;
}): Promise<({ ok: true } & WaAccountHealth) | { ok: false; error: string }> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${opts.phoneNumberId}?fields=display_phone_number,quality_rating,messaging_limit_tier`;
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
    quality_rating?: string;
    messaging_limit_tier?: string;
    error?: { message?: string };
  };
  if (!res.ok || data.error)
    return { ok: false, error: data.error?.message ?? `Meta respondeu HTTP ${res.status}.` };
  const rating = data.quality_rating;
  return {
    ok: true,
    displayPhone: data.display_phone_number ?? null,
    qualityRating:
      rating === "GREEN" || rating === "YELLOW" || rating === "RED" || rating === "UNKNOWN"
        ? rating
        : null,
    messagingLimitTier: data.messaging_limit_tier ?? null,
  };
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
