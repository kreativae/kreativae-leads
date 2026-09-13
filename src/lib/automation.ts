import { db } from "@/db";
import { conversations, leads, messages } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getWaAccount, type ResendConfig } from "@/lib/settings-db";
import { sendWaText } from "@/lib/whatsapp";
import { sendEmail } from "@/lib/email";
import { logEvent } from "@/lib/system-log";
import {
  buildWhatsappMessage,
  emailSubject,
  textoParaHtmlEmail,
  type MessageLead,
} from "@/lib/messages";

const MAX_PARTES = 10;
const PAUSA_ENTRE_PARTES_MS = 1400;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface AutomationLead {
  id: string;
  companyName: string;
  whatsapp: string | null;
  email: string | null;
}

/**
 * A mesma "Abordagem pronta" do drawer: leva em conta se o lead tem site e
 * o diagnostico coletado. WhatsApp nao leva assinatura; o e-mail leva.
 */
export function buildAutomationContent(
  lead: MessageLead,
  senderName: string | null,
): { message: string; subject: string; html: string } {
  const useAnalysis = (lead.websiteChecks?.length ?? 0) > 0;
  const message = buildWhatsappMessage(lead, { useAnalysis });
  const subject = emailSubject(lead);
  const corpoEmail = buildWhatsappMessage(lead, {
    useAnalysis,
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
 * So conseguimos mandar texto livre dentro de uma conversa ja aberta —
 * primeiro contato via WhatsApp exige template aprovado pela Meta, que este
 * sistema ainda nao implementa. `semConversa` sinaliza esse caso a parte pra
 * quem chamou decidir se cai pra e-mail.
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

/** Grava o resultado no lead e no log — mesmo formato usado pelo n8n e pelo envio interno. */
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
