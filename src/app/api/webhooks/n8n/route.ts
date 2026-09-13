import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/db";
import { conversations, leads, messages } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getN8nConfig, getResendConfig, getWaAccount } from "@/lib/settings-db";
import { sendWaText } from "@/lib/whatsapp";
import { sendEmail } from "@/lib/email";
import { logEvent } from "@/lib/system-log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PARTES = 10;
const PAUSA_ENTRE_PARTES_MS = 1400;

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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

  async function tentarWhatsapp(): Promise<{ ok: boolean; detail: string; semConversa: boolean }> {
    // "messages" (array) = envia cada parte como uma bolha separada, com
    // pausa entre elas (etapas); "message" (string única) = tudo em bloco.
    // Da perspectiva do n8n é só escolher qual shape mandar.
    const partes = Array.isArray(body.messages)
      ? body.messages
          .filter((m): m is string => typeof m === "string" && m.trim().length > 0)
          .map((m) => m.trim())
          .slice(0, MAX_PARTES)
      : typeof body.message === "string" && body.message.trim()
        ? [body.message.trim()]
        : [];

    if (partes.length === 0 || !lead.whatsapp)
      return {
        ok: false,
        semConversa: false,
        detail: "Mensagem (ou mensagens) ausente, ou WhatsApp do lead ausente.",
      };

    // So conseguimos mandar texto livre dentro de uma conversa ja aberta —
    // primeiro contato via WhatsApp exige template aprovado pela Meta, que
    // este sistema ainda nao implementa. Sinalizamos esse caso a parte pra
    // quem chamou decidir se cai pra e-mail.
    const [convo] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.leadId, lead.id))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(1);
    const conta = convo?.waAccountId ? await getWaAccount(convo.waAccountId) : null;
    if (!convo || !conta)
      return {
        ok: false,
        semConversa: true,
        detail:
          "Sem conversa aberta com esse lead — primeiro contato por WhatsApp exige template aprovado pela Meta.",
      };

    let enviadas = 0;
    let ultimoErro: string | null = null;
    for (let i = 0; i < partes.length; i++) {
      const parte = partes[i];
      const result = await sendWaText({
        accessToken: conta.accessToken,
        phoneNumberId: conta.phoneNumberId,
        to: convo.contactPhone,
        body: parte,
      });
      if (!result.ok) {
        ultimoErro = result.error ?? "Falha no envio.";
        break; // para na primeira falha — nao manda partes fora de ordem
      }
      enviadas++;
      await db.insert(messages).values({
        conversationId: convo.id,
        direction: "out",
        body: parte,
        waMessageId: result.waMessageId ?? null,
        status: "sent",
        type: "text",
      });
      if (i < partes.length - 1) await sleep(PAUSA_ENTRE_PARTES_MS);
    }
    if (enviadas > 0) {
      const now = new Date();
      await db
        .update(conversations)
        .set({
          lastMessageAt: now,
          lastMessagePreview: partes[enviadas - 1].slice(0, 140),
          updatedAt: now,
        })
        .where(eq(conversations.id, convo.id));
    }
    const ok = enviadas === partes.length;
    return {
      ok,
      semConversa: false,
      detail: ok
        ? ""
        : enviadas > 0
          ? `${enviadas}/${partes.length} parte(s) enviada(s) — parou em: ${ultimoErro}`
          : ultimoErro ?? "Falha no envio.",
    };
  }

  async function tentarEmail(): Promise<{ ok: boolean; detail: string }> {
    const resendConfig = await getResendConfig();
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const html = typeof body.html === "string" ? body.html : "";
    if (!resendConfig || !lead.email || !subject || !html)
      return {
        ok: false,
        detail: "E-mail não configurado, ou faltou e-mail do lead, assunto ou conteúdo.",
      };
    const result = await sendEmail({
      apiKey: resendConfig.apiKey,
      from: resendConfig.from,
      to: lead.email,
      subject,
      html,
    });
    return { ok: result.ok, detail: result.ok ? "" : result.error ?? "Falha no envio." };
  }

  let ok = false;
  let detail = "";
  // Canal que realmente foi usado — pode diferir do pedido se caiu pra
  // e-mail depois de o WhatsApp nao ter conversa aberta pra usar.
  let canalUsado: "whatsapp" | "email" = channel;
  let caiuParaEmail = false;

  if (channel === "whatsapp") {
    const r = await tentarWhatsapp();
    ok = r.ok;
    detail = r.detail;
    // So tenta e-mail se o motivo especifico foi "sem conversa aberta" — um
    // erro real de envio (numero invalido, Meta fora do ar) nao deve virar
    // e-mail silenciosamente, o problema pode ser outro.
    if (!ok && r.semConversa && lead.email) {
      const fallback = await tentarEmail();
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
    const r = await tentarEmail();
    ok = r.ok;
    detail = r.detail;
  }

  await db
    .update(leads)
    .set({
      automationStatus: ok ? "done" : "failed",
      automationChannel: canalUsado,
      automationAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(leads.id, leadId));

  await logEvent({
    source: "automation",
    status: ok ? "ok" : "error",
    message: caiuParaEmail
      ? `WhatsApp sem conversa aberta — caiu para e-mail: ${lead.companyName}`
      : `${canalUsado === "whatsapp" ? "WhatsApp" : "E-mail"} ${ok ? "enviado" : "falhou"}: ${lead.companyName}`,
    detail: ok ? null : detail,
    leadId,
  });

  return ok
    ? NextResponse.json({ ok: true, channel: canalUsado })
    : NextResponse.json({ ok: false, error: detail }, { status: 502 });
}
