import { Resend } from "resend";

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function sendEmail(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<SendEmailResult> {
  try {
    const resend = new Resend(opts.apiKey);
    const { data, error } = await resend.emails.send({
      from: opts.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Falha ao enviar e-mail." };
  }
}

/** Confere a chave sem enviar nada — lista os domínios verificados na conta. */
export async function testResendKey(
  apiKey: string,
): Promise<{ ok: true; domains: string[] } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Sem conexão com o Resend." };
  }
  const data = (await res.json().catch(() => ({}))) as {
    data?: { name: string; status: string }[];
    message?: string;
  };
  if (!res.ok) return { ok: false, error: data.message ?? `Resend respondeu HTTP ${res.status}.` };
  return {
    ok: true,
    domains: (data.data ?? []).map((d) => `${d.name} (${d.status})`),
  };
}
