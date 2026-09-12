import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversations, leads, messages } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { getWaAccount } from "@/lib/settings-db";
import { sendWaMedia, sendWaText, waMediaTypeFromMime } from "@/lib/whatsapp";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt))
    .limit(500);

  const [convo] = await db
    .select({ leadId: conversations.leadId })
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);

  let lead = null;
  if (convo?.leadId) {
    const [row] = await db.select().from(leads).where(eq(leads.id, convo.leadId)).limit(1);
    lead = row ?? null;
  }

  return NextResponse.json({ messages: rows, lead });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const [removida] = await db.delete(conversations).where(eq(conversations.id, id)).returning();
  if (!removida)
    return NextResponse.json({ ok: false, error: "Conversa não encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(_req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  await db
    .update(conversations)
    .set({ unreadCount: 0 })
    .where(eq(conversations.id, id));
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  let body: { body?: unknown; mediaUrl?: unknown; mimeType?: unknown; filename?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  // Duas formas de mandar: texto puro (body) ou midia ja hospedada no Blob
  // pelo upload direto do browser (mediaUrl) — a legenda continua em body.
  const mediaUrl = typeof body.mediaUrl === "string" ? body.mediaUrl.trim() : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType.trim() : "";
  const filename = typeof body.filename === "string" ? body.filename.trim() : "";
  const text = typeof body.body === "string" ? body.body.trim() : "";
  const caption = text.slice(0, 1024);

  if (!mediaUrl && (!text || text.length > 4000))
    return NextResponse.json(
      { ok: false, error: "Mensagem vazia ou muito longa (máx. 4000)." },
      { status: 400 },
    );
  if (mediaUrl && !mimeType)
    return NextResponse.json({ ok: false, error: "Tipo do arquivo ausente." }, { status: 400 });

  const [convo] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  if (!convo)
    return NextResponse.json(
      { ok: false, error: "Conversa não encontrada." },
      { status: 404 },
    );

  // A conversa carrega DE QUAL numero ela e — sem isso a resposta sairia
  // sempre do mesmo numero, mesmo quando o contato escreveu para o outro.
  const conta = convo.waAccountId ? await getWaAccount(convo.waAccountId) : null;
  if (!conta)
    return NextResponse.json(
      {
        ok: false,
        error:
          "Esta conversa não tem um número de WhatsApp vinculado. Configure as contas em Configurações.",
      },
      { status: 400 },
    );

  const tipoMidia = mediaUrl ? waMediaTypeFromMime(mimeType) : null;
  const result = mediaUrl
    ? await sendWaMedia({
        accessToken: conta.accessToken,
        phoneNumberId: conta.phoneNumberId,
        to: convo.contactPhone,
        type: tipoMidia!,
        link: mediaUrl,
        caption: caption || undefined,
        filename: filename || undefined,
      })
    : await sendWaText({
        accessToken: conta.accessToken,
        phoneNumberId: conta.phoneNumberId,
        to: convo.contactPhone,
        body: text,
      });

  if (!result.ok) {
    const hint =
      result.error?.includes("131030") || result.error?.includes("24")
        ? " Possível causa: a janela de 24h da conversa expirou — a Meta exige uma mensagem de template para reabrir o contato."
        : "";
    return NextResponse.json(
      { ok: false, error: (result.error ?? "Falha no envio.") + hint },
      { status: 502 },
    );
  }

  const now = new Date();
  const preview = mediaUrl ? caption || `[${tipoMidia}]` : text;
  const [message] = await db
    .insert(messages)
    .values({
      conversationId: id,
      direction: "out",
      body: mediaUrl ? caption : text,
      waMessageId: result.waMessageId ?? null,
      status: "sent",
      type: tipoMidia ?? "text",
      mediaUrl: mediaUrl || null,
      mimeType: mediaUrl ? mimeType : null,
      fileName: mediaUrl ? filename || null : null,
    })
    .returning();

  await db
    .update(conversations)
    .set({
      lastMessageAt: now,
      lastMessagePreview: preview.slice(0, 140),
      updatedAt: now,
    })
    .where(eq(conversations.id, id));

  return NextResponse.json({ ok: true, message });
}
