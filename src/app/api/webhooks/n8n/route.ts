import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getN8nConfig, getResendConfig } from "@/lib/settings-db";
import { finalizeAutomation, sendViaEmail, sendViaWhatsapp } from "@/lib/automation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Callback do n8n: ele decide O QUE mandar, mas quem manda de fato e a
 * gente — assim o envio entra em Conversas normalmente (WhatsApp) e usa
 * nosso Resend (e-mail), em vez de sair por fora do sistema.
 */
export async function POST(req: Request) {
  const config = await getN8nConfig();
  if (!config)
    return NextResponse.json({ ok: false, error: "Automação não configurada." }, { status: 503 });

  const secret = req.headers.get("x-automation-secret") ?? "";
  if (!safeEqual(secret, config.callbackSecret))
    return NextResponse.json({ ok: false, error: "Segredo inválido." }, { status: 401 });

  let body: {
    leadId?: unknown;
    channel?: unknown;
    message?: unknown;
    messages?: unknown;
    subject?: unknown;
    html?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const leadId = typeof body.leadId === "string" ? body.leadId : "";
  const channel =
    body.channel === "email" ? "email" : body.channel === "whatsapp" ? "whatsapp" : null;
  if (!leadId || !channel)
    return NextResponse.json(
      { ok: false, error: "leadId e channel (whatsapp|email) são obrigatórios." },
      { status: 400 },
    );

  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead)
    return NextResponse.json({ ok: false, error: "Lead não encontrado." }, { status: 404 });

  // "messages" (array) = envia cada parte como uma bolha separada, com pausa
  // entre elas (etapas); "message" (string única) = tudo em bloco. Da
  // perspectiva do n8n e so escolher qual shape mandar.
  const partes = Array.isArray(body.messages)
    ? body.messages.filter((m): m is string => typeof m === "string")
    : typeof body.message === "string"
      ? [body.message]
      : [];
  const subject = typeof body.subject === "string" ? body.subject : "";
  const html = typeof body.html === "string" ? body.html : "";

  let ok = false;
  let detail = "";
  // Canal que realmente foi usado — pode diferir do pedido se caiu pra
  // e-mail depois de o WhatsApp nao ter conversa aberta pra usar.
  let canalUsado: "whatsapp" | "email" = channel;
  let caiuParaEmail = false;

  if (channel === "whatsapp") {
    const r = await sendViaWhatsapp(lead, partes);
    ok = r.ok;
    detail = r.detail;
    // So tenta e-mail se o motivo especifico foi "sem conversa aberta" — um
    // erro real de envio (numero invalido, Meta fora do ar) nao deve virar
    // e-mail silenciosamente, o problema pode ser outro.
    if (!ok && r.semConversa && lead.email) {
      const resendConfig = await getResendConfig();
      const fallback = await sendViaEmail(lead, resendConfig, subject, html);
      if (fallback.ok) {
        ok = true;
        canalUsado = "email";
        caiuParaEmail = true;
        detail = "";
      } else {
        detail = `${r.detail} E-mail também falhou: ${fallback.detail}`;
      }
    }
  } else {
    const resendConfig = await getResendConfig();
    const r = await sendViaEmail(lead, resendConfig, subject, html);
    ok = r.ok;
    detail = r.detail;
  }

  await finalizeAutomation({
    leadId,
    companyName: lead.companyName,
    ok,
    canalUsado,
    detail,
    caiuParaEmail,
  });

  return ok
    ? NextResponse.json({ ok: true, channel: canalUsado })
    : NextResponse.json({ ok: false, error: detail }, { status: 502 });
}
