import { db } from "@/db";
import { conversations, leads, messages } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import {
  getAutomationSettings,
  getWaAccount,
  getWaAccountForLocale,
  type ResendConfig,
} from "@/lib/settings-db";
import { renderWaTemplateBody, sendWaText, sendWaTemplate } from "@/lib/whatsapp";
import { sendEmail } from "@/lib/email";
import { logEvent } from "@/lib/system-log";
import {
  buildWhatsappMessage,
  emailSubject,
  textoParaHtmlEmail,
  type MessageLead,
  type MessageStyle,
} from "@/lib/messages";

const MAX_PARTES = 10;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface AutomationLead {
  id: string;
  companyName: string;
  whatsapp: string | null;
  email: string | null;
  country: string;
}

/**
 * A mesma "Abordagem pronta" do drawer: leva em conta se o lead tem site e
 * o diagnostico coletado. WhatsApp nao leva assinatura; o e-mail leva.
 * `style`/`includeAbout` vem de Configurações → Automação — fica a cargo de
 * quem chama buscar isso (getAutomationSettings) e passar aqui; a função
 * continua pura e sem I/O, então dá pra testar sem tocar no banco.
 */
export function buildAutomationContent(
  lead: MessageLead,
  senderName: string | null,
  opts: { style?: MessageStyle; includeAbout?: boolean } = {},
): { message: string; subject: string; html: string } {
  const useAnalysis = (lead.websiteChecks?.length ?? 0) > 0;
  const geracaoOpts = { useAnalysis, style: opts.style, includeAbout: opts.includeAbout };
  const message = buildWhatsappMessage(lead, geracaoOpts);
  const subject = emailSubject(lead);
  const corpoEmail = buildWhatsappMessage(lead, {
    ...geracaoOpts,
    includeSignature: true,
    senderName,
  });
  const html = textoParaHtmlEmail(corpoEmail);
  return { message, subject, html };
}

export interface EnvioResult {
  ok: boolean;
  detail: string;
  semConversa: boolean;
}

/**
 * Texto livre so funciona dentro de uma conversa ja aberta. Sem conversa,
 * tenta abrir uma cold com o template aprovado da Meta pro idioma do lead
 * (configurado em Configurações → Automação); so se isso tambem nao der
 * (sem conta/template pro idioma, ou a Meta rejeitar o envio) e que devolve
 * `semConversa: true`, pra quem chamou decidir se cai pra e-mail.
 */
export async function sendViaWhatsapp(
  lead: AutomationLead,
  partesEntrada: string[],
): Promise<EnvioResult> {
  const partes = partesEntrada
    .filter((m) => typeof m === "string" && m.trim().length > 0)
    .map((m) => m.trim())
    .slice(0, MAX_PARTES);

  if (partes.length === 0 || !lead.whatsapp)
    return {
      ok: false,
      semConversa: false,
      detail: "Mensagem ausente, ou WhatsApp do lead ausente.",
    };

  const [convo] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.leadId, lead.id))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(1);
  const conta = convo?.waAccountId ? await getWaAccount(convo.waAccountId) : null;
  if (!convo || !conta) {
    const abriu = await abrirConversaComTemplate(lead);
    if (abriu.ok) return { ok: true, semConversa: false, detail: "" };
    return {
      ok: false,
      semConversa: true,
      detail: abriu.detail,
    };
  }

  const { waPauseMs } = await getAutomationSettings();
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
    if (i < partes.length - 1) await sleep(waPauseMs);
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

/**
 * Primeiro contato via WhatsApp: manda o template aprovado pra Meta (unica
 * forma de comecar uma conversa do zero) e, se aceito, ja registra a
 * conversa e a mensagem por aqui, como se fosse um envio normal.
 */
async function abrirConversaComTemplate(
  lead: AutomationLead,
): Promise<{ ok: boolean; detail: string }> {
  if (!lead.whatsapp)
    return { ok: false, detail: "WhatsApp do lead ausente." };

  const locale: "BR" | "PT" = lead.country === "PT" ? "PT" : "BR";
  const { templates } = await getAutomationSettings();
  const template = templates[locale];
  const textoParaRegistro = renderWaTemplateBody(template.bodyTemplate, lead.companyName);
  const conta = await getWaAccountForLocale(locale);
  if (!conta)
    return {
      ok: false,
      detail: `Sem conversa aberta com esse lead — e não há conta de WhatsApp configurada pra ${locale === "PT" ? "Portugal" : "Brasil"} pra abrir uma nova via template.`,
    };

  const resultado = await sendWaTemplate({
    accessToken: conta.accessToken,
    phoneNumberId: conta.phoneNumberId,
    to: lead.whatsapp,
    templateName: template.name,
    languageCode: template.language,
    bodyParam: template.bodyTemplate.includes("{{empresa}}") ? lead.companyName : null,
  });
  if (!resultado.ok)
    return {
      ok: false,
      detail: `Sem conversa aberta com esse lead — o template do WhatsApp falhou: ${resultado.error ?? "erro desconhecido"}.`,
    };

  const now = new Date();
  const preview = textoParaRegistro.slice(0, 140);
  let [convo] = await db
    .insert(conversations)
    .values({
      leadId: lead.id,
      contactName: lead.companyName,
      waAccountId: conta.id,
      contactPhone: lead.whatsapp,
      lastMessageAt: now,
      lastMessagePreview: preview,
    })
    .onConflictDoNothing({
      target: [conversations.contactPhone, conversations.waAccountId],
    })
    .returning();
  if (!convo) {
    // Corrida rara: uma conversa surgiu (ex.: inbound) entre a checagem e
    // este insert. A mensagem ja foi enviada de verdade, entao so precisa
    // achar a linha que ganhou a corrida pra anexar o registro nela.
    [convo] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.contactPhone, lead.whatsapp),
          eq(conversations.waAccountId, conta.id),
        ),
      )
      .limit(1);
  }
  if (convo) {
    await db.insert(messages).values({
      conversationId: convo.id,
      direction: "out",
      body: textoParaRegistro,
      waMessageId: resultado.waMessageId ?? null,
      status: "sent",
      type: "text",
    });
  }
  return { ok: true, detail: "" };
}

export async function sendViaEmail(
  lead: AutomationLead,
  resendConfig: ResendConfig | null,
  subject: string,
  html: string,
): Promise<{ ok: boolean; detail: string }> {
  if (!resendConfig || !lead.email || !subject.trim() || !html)
    return {
      ok: false,
      detail: "E-mail não configurado, ou faltou e-mail do lead, assunto ou conteúdo.",
    };
  const result = await sendEmail({
    apiKey: resendConfig.apiKey,
    from: resendConfig.from,
    to: lead.email,
    subject: subject.trim(),
    html,
  });
  return { ok: result.ok, detail: result.ok ? "" : result.error ?? "Falha no envio." };
}

/** Grava o resultado da automação no lead e no log. */
export async function finalizeAutomation(opts: {
  leadId: string;
  companyName: string;
  ok: boolean;
  canalUsado: "whatsapp" | "email";
  detail: string;
  caiuParaEmail: boolean;
}) {
  const { leadId, companyName, ok, canalUsado, detail, caiuParaEmail } = opts;
  const [updated] = await db
    .update(leads)
    .set({
      automationStatus: ok ? "done" : "failed",
      automationChannel: canalUsado,
      automationAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(leads.id, leadId))
    .returning();

  await logEvent({
    source: "automation",
    status: ok ? "ok" : "error",
    message: caiuParaEmail
      ? `WhatsApp sem conversa aberta — caiu para e-mail: ${companyName}`
      : `${canalUsado === "whatsapp" ? "WhatsApp" : "E-mail"} ${ok ? "enviado" : "falhou"}: ${companyName}`,
    detail: ok ? null : detail,
    leadId,
  });

  return updated;
}
