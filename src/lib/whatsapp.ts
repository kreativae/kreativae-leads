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
