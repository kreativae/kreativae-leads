import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { getWaConfig } from "@/lib/settings-db";
import { sendWaText } from "@/lib/whatsapp";
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
  return NextResponse.json({ messages: rows });
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
  let body: { body?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text || text.length > 4000)
    return NextResponse.json(
      { ok: false, error: "Mensagem vazia ou muito longa (máx. 4000)." },
      { status: 400 },
    );

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

  const config = await getWaConfig();
  if (!config)
    return NextResponse.json(
      {
        ok: false,
        error:
          "WhatsApp Cloud API não configurada. Preencha token e Phone Number ID em Configurações.",
      },
      { status: 400 },
    );

  const result = await sendWaText({
    accessToken: config.accessToken,
    phoneNumberId: config.phoneNumberId,
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
  const [message] = await db
    .insert(messages)
    .values({
      conversationId: id,
      direction: "out",
      body: text,
      waMessageId: result.waMessageId ?? null,
      status: "sent",
    })
    .returning();

  await db
    .update(conversations)
    .set({
      lastMessageAt: now,
      lastMessagePreview: text.slice(0, 140),
      updatedAt: now,
    })
    .where(eq(conversations.id, id));

  return NextResponse.json({ ok: true, message });
}
