import { NextResponse } from "next/server";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getN8nConfig } from "@/lib/settings-db";
import { logEvent } from "@/lib/system-log";
import { buildWhatsappMessage, emailSubject, textoParaHtmlEmail } from "@/lib/messages";
import type { SiteCheck } from "@/lib/site-analyzer";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

/**
 * A mensagem sai daqui pronta — mesma "Abordagem pronta" que existe no
 * drawer, usando o que a coleta ja sabe sobre o lead (tem site ou nao,
 * diagnostico do site). O n8n so decide o canal e devolve o resultado em
 * /api/webhooks/n8n; ele nao inventa texto.
 */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  const config = await getN8nConfig();
  if (!config)
    return NextResponse.json(
      {
        ok: false,
        error: "Automação não configurada. Preencha o webhook do n8n em Configurações.",
      },
      { status: 400 },
    );

  const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!lead)
    return NextResponse.json({ ok: false, error: "Lead não encontrado." }, { status: 404 });
  if (!lead.whatsapp && !lead.email)
    return NextResponse.json(
      { ok: false, error: "Lead sem WhatsApp nem e-mail cadastrado." },
      { status: 400 },
    );

  const websiteChecks = Array.isArray(lead.websiteChecks)
    ? (lead.websiteChecks as SiteCheck[])
    : null;
  const leadParaMensagem = {
    id: lead.id,
    companyName: lead.companyName,
    ownerName: lead.ownerName,
    city: lead.city,
    country: lead.country,
    website: lead.website,
    websiteGrade: lead.websiteGrade,
    websiteChecks,
  };
  const useAnalysis = (websiteChecks?.length ?? 0) > 0;

  // WhatsApp nao leva assinatura (nao faz sentido no formato); o e-mail leva.
  const message = buildWhatsappMessage(leadParaMensagem, { useAnalysis });
  const subject = emailSubject(leadParaMensagem);
  const corpoEmail = buildWhatsappMessage(leadParaMensagem, {
    useAnalysis,
    includeSignature: true,
    senderName: auth.user.name,
  });
  const html = textoParaHtmlEmail(corpoEmail);

  const origin = new URL(req.url).origin;
  let res: Response;
  try {
    res = await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: lead.id,
        companyName: lead.companyName,
        ownerName: lead.ownerName,
        segment: lead.segment,
        city: lead.city,
        state: lead.state,
        country: lead.country,
        whatsapp: lead.whatsapp,
        email: lead.email,
        website: lead.website,
        instagram: lead.igUsername,
        callbackUrl: `${origin}/api/webhooks/n8n`,
        message,
        subject,
        html,
      }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch (err) {
    await logEvent({
      source: "automation",
      status: "error",
      message: `Falha ao disparar automação: ${lead.companyName}`,
      detail: err instanceof Error ? err.message : "Erro de conexão com o n8n.",
      leadId: lead.id,
    });
    return NextResponse.json(
      { ok: false, error: "Não foi possível contatar o n8n." },
      { status: 502 },
    );
  }

  if (!res.ok) {
    await logEvent({
      source: "automation",
      status: "error",
      message: `n8n respondeu HTTP ${res.status}: ${lead.companyName}`,
      leadId: lead.id,
    });
    return NextResponse.json(
      { ok: false, error: `n8n respondeu HTTP ${res.status}.` },
      { status: 502 },
    );
  }

  const [updated] = await db
    .update(leads)
    .set({ automationStatus: "pending", automationAt: new Date(), updatedAt: new Date() })
    .where(eq(leads.id, id))
    .returning();

  await logEvent({
    source: "automation",
    status: "ok",
    message: `Disparado para o n8n: ${lead.companyName}`,
    leadId: lead.id,
  });

  return NextResponse.json({ ok: true, lead: updated });
}
