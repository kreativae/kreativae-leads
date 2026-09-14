import { NextResponse } from "next/server";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getAutomationMode, getN8nConfig, getResendConfig } from "@/lib/settings-db";
import { logEvent } from "@/lib/system-log";
import {
  buildAutomationContent,
  finalizeAutomation,
  sendViaEmail,
  sendViaWhatsapp,
} from "@/lib/automation";
import type { SiteCheck } from "@/lib/site-analyzer";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

/**
 * A mensagem sai daqui pronta — mesma "Abordagem pronta" que existe no
 * drawer, usando o que a coleta ja sabe sobre o lead (tem site ou nao,
 * diagnostico do site). Modo "n8n": so dispara o gatilho, quem manda de
 * fato e o callback em /api/webhooks/n8n. Modo "interno": manda direto,
 * sem depender do n8n estar configurado ou no ar.
 */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  let canalPedido: "whatsapp" | "email" | undefined;
  try {
    const body = (await req.json()) as { channel?: unknown };
    canalPedido =
      body?.channel === "whatsapp" || body?.channel === "email" ? body.channel : undefined;
  } catch {
    // Corpo vazio (chamada antiga, sem canal escolhido) — segue com o
    // comportamento automatico de sempre.
  }

  const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!lead)
    return NextResponse.json({ ok: false, error: "Lead não encontrado." }, { status: 404 });
  if (!lead.whatsapp && !lead.email)
    return NextResponse.json(
      { ok: false, error: "Lead sem WhatsApp nem e-mail cadastrado." },
      { status: 400 },
    );
  if (canalPedido === "whatsapp" && !lead.whatsapp)
    return NextResponse.json(
      { ok: false, error: "Lead sem WhatsApp cadastrado." },
      { status: 400 },
    );
  if (canalPedido === "email" && !lead.email)
    return NextResponse.json({ ok: false, error: "Lead sem e-mail cadastrado." }, { status: 400 });

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
  const { message, subject, html } = buildAutomationContent(leadParaMensagem, auth.user.name);

  const mode = await getAutomationMode();

  if (mode === "interno") {
    let ok = false;
    let detail = "";
    let canalUsado: "whatsapp" | "email" = canalPedido ?? (lead.whatsapp ? "whatsapp" : "email");
    let caiuParaEmail = false;

    // Canal escolhido na hora (botao de WhatsApp ou de e-mail no drawer): so
    // tenta esse, sem cair pro outro sozinho — quem decidiu foi quem clicou.
    if (canalPedido === "email") {
      const resendConfig = await getResendConfig();
      const r = await sendViaEmail(lead, resendConfig, subject, html);
      ok = r.ok;
      detail = r.detail;
    } else if (canalPedido === "whatsapp") {
      const r = await sendViaWhatsapp(lead, [message]);
      ok = r.ok;
      detail = r.detail;
    } else if (lead.whatsapp) {
      // Sem escolha explicita (chamada antiga): mantem o automatico de
      // sempre, com fallback pra e-mail quando faltar conversa aberta.
      const r = await sendViaWhatsapp(lead, [message]);
      ok = r.ok;
      detail = r.detail;
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

    const updated = await finalizeAutomation({
      leadId: lead.id,
      companyName: lead.companyName,
      ok,
      canalUsado,
      detail,
      caiuParaEmail,
    });

    return NextResponse.json({
      ok,
      lead: updated,
      mode,
      channel: canalUsado,
      error: ok ? undefined : detail,
    });
  }

  const config = await getN8nConfig();
  if (!config)
    return NextResponse.json(
      {
        ok: false,
        error: "Automação não configurada. Preencha o webhook do n8n em Configurações.",
      },
      { status: 400 },
    );

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

  return NextResponse.json({ ok: true, lead: updated, mode });
}
