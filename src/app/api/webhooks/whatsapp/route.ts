import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/db";
import { conversations, leads, messages } from "@/db/schema";
import { and, eq, ilike, isNotNull, sql } from "drizzle-orm";
import { getEffectiveSetting, getWaAccountByPhoneNumberId } from "@/lib/settings-db";
import { downloadWaMedia, getWaMediaMeta } from "@/lib/whatsapp";
import { uploadToBlob } from "@/lib/blob";

export const dynamic = "force-dynamic";

/** Meta webhook verification handshake. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const mode = sp.get("hub.mode");
  const token = sp.get("hub.verify_token");
  const challenge = sp.get("hub.challenge");

  const expected = await getEffectiveSetting("wa_verify_token", "WA_VERIFY_TOKEN");
  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return NextResponse.json({ ok: false, error: "Verificação falhou." }, { status: 403 });
}

interface WaWebhookPayload {
  object?: string;
  entry?: {
    changes?: {
      value?: {
        // Qual dos NOSSOS numeros recebeu: e assim que a Meta identifica,
        // quando o app tem mais de um numero atras do mesmo webhook.
        metadata?: { phone_number_id?: string };
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: {
          from?: string;
          id?: string;
          type?: string;
          text?: { body?: string };
          image?: { id?: string; mime_type?: string; caption?: string };
          video?: { id?: string; mime_type?: string; caption?: string };
          audio?: { id?: string; mime_type?: string };
          sticker?: { id?: string; mime_type?: string };
          document?: { id?: string; mime_type?: string; caption?: string; filename?: string };
        }[];
        statuses?: { id?: string; status?: string }[];
      };
    }[];
  }[];
}

function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !signature.startsWith("sha256=")) return false;
  const expected =
    "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

const TIPOS_MIDIA = ["image", "video", "audio", "sticker", "document"] as const;
type TipoMidia = (typeof TIPOS_MIDIA)[number];

interface MidiaInbound {
  ok: true;
  type: TipoMidia;
  mediaUrl: string;
  mimeType: string | null;
  fileName: string | null;
  caption: string;
}
interface MidiaFalha {
  ok: false;
  placeholder: string;
}

/**
 * Baixa a midia de uma mensagem recebida (URL da Meta expira em minutos) e
 * sobe uma copia nossa pro Blob, pra ficar acessivel depois. Se qualquer
 * passo falhar, cai num placeholder de texto em vez de perder a mensagem
 * inteira — o historico continua, só sem o arquivo.
 */
async function resolverMidiaInbound(
  msg: Record<string, unknown>,
  tipo: TipoMidia,
  accessToken: string | undefined,
): Promise<MidiaInbound | MidiaFalha> {
  const obj = msg[tipo] as
    | { id?: string; mime_type?: string; caption?: string; filename?: string }
    | undefined;
  const mediaId = obj?.id;
  if (!accessToken || !mediaId)
    return { ok: false, placeholder: `[${tipo} recebida]` };

  const meta = await getWaMediaMeta({ accessToken, mediaId });
  if (!meta.ok || !meta.url) return { ok: false, placeholder: `[${tipo} recebida]` };

  const baixado = await downloadWaMedia({ accessToken, url: meta.url });
  if (!baixado.ok) return { ok: false, placeholder: `[${tipo} recebida]` };

  const mimeType = meta.mimeType ?? obj?.mime_type ?? "application/octet-stream";
  const fileName = obj?.filename ?? null;
  try {
    const mediaUrl = await uploadToBlob({
      bytes: baixado.bytes,
      contentType: mimeType,
      filename: fileName ?? `${tipo}.${mimeType.split("/")[1] ?? "bin"}`,
    });
    return { ok: true, type: tipo, mediaUrl, mimeType, fileName, caption: obj?.caption ?? "" };
  } catch (err) {
    console.error("Falha ao subir mídia recebida no Blob:", err);
    return { ok: false, placeholder: `[${tipo} recebida]` };
  }
}

async function findLeadByPhone(phone: string): Promise<string | null> {
  const last9 = phone.slice(-9);
  if (last9.length < 8) return null;
  const byWhats = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(isNotNull(leads.whatsapp), ilike(leads.whatsapp, `%${last9}`)))
    .limit(1);
  if (byWhats[0]) return byWhats[0].id;
  const byPhone = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(isNotNull(leads.phone), ilike(leads.phone, `%${last9}`)))
    .limit(1);
  return byPhone[0]?.id ?? null;
}

export async function POST(req: Request) {
  const raw = await req.text();

  // Rota pública: sem segredo não há como distinguir a Meta de um impostor,
  // então recusamos o payload em vez de confiar nele.
  const appSecret = await getEffectiveSetting("wa_app_secret", "WA_APP_SECRET");
  if (!appSecret) {
    console.error(
      "WhatsApp webhook recusado: wa_app_secret não configurado (Configurações → WhatsApp).",
    );
    return NextResponse.json(
      { ok: false, error: "Webhook não configurado." },
      { status: 503 },
    );
  }
  const sig = req.headers.get("x-hub-signature-256");
  if (!verifySignature(raw, sig, appSecret)) {
    return NextResponse.json({ ok: false, error: "Assinatura inválida." }, { status: 401 });
  }

  let payload: WaWebhookPayload;
  try {
    payload = JSON.parse(raw) as WaWebhookPayload;
  } catch {
    return NextResponse.json({ ok: true }); // ACK anyway to stop retries
  }

  if (payload.object !== "whatsapp_business_account") {
    return NextResponse.json({ ok: true });
  }

  try {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};

        // Delivery/read receipts for our outbound messages
        for (const st of value.statuses ?? []) {
          if (!st.id || !st.status) continue;
          if (st.status === "read") {
            await db
              .update(messages)
              .set({ status: "read" })
              .where(eq(messages.waMessageId, st.id));
          } else if (st.status === "delivered" || st.status === "sent") {
            await db
              .update(messages)
              .set({ status: st.status })
              .where(
                and(
                  eq(messages.waMessageId, st.id),
                  sql`${messages.status} = 'sent'`,
                ),
              );
          }
        }

        // Inbound messages
        // Resolvida uma vez por change: todas as mensagens de um mesmo
        // "value" chegaram no mesmo numero nosso.
        const waAccount = value.metadata?.phone_number_id
          ? await getWaAccountByPhoneNumberId(value.metadata.phone_number_id)
          : null;

        for (const msg of value.messages ?? []) {
          if (!msg.from || !msg.id) continue;
          const phone = msg.from.replace(/\D+/g, "");
          const contact = value.contacts?.find((c) => c.wa_id === phone);

          const tipoMidia = TIPOS_MIDIA.find((t) => t === msg.type);
          const midia = tipoMidia
            ? await resolverMidiaInbound(
                msg as unknown as Record<string, unknown>,
                tipoMidia,
                waAccount?.accessToken,
              )
            : null;

          const bodyText =
            msg.type === "text"
              ? (msg.text?.body ?? "")
              : midia?.ok
                ? midia.caption
                : (midia as MidiaFalha | null)?.placeholder ?? `[${msg.type ?? "mídia"} recebida]`;

          // Dedup by waMessageId (Meta may retry webhooks)
          const existing = await db
            .select({ id: messages.id })
            .from(messages)
            .where(eq(messages.waMessageId, msg.id))
            .limit(1);
          if (existing.length > 0) continue;

          const leadId = await findLeadByPhone(phone);
          const now = new Date();

          if (!waAccount) {
            // Numero nosso desconhecido: nao interrompe (a mensagem ainda e
            // real), so fica sem conta vinculada — e sem ela nao da para
            // responder depois, entao vale investigar se aparecer.
            console.error(
              `Webhook WhatsApp: phone_number_id ${value.metadata?.phone_number_id ?? "(ausente)"} nao bate com nenhuma conta cadastrada.`,
            );
          }

          const [convo] = await db
            .insert(conversations)
            .values({
              contactPhone: phone,
              contactName: contact?.profile?.name ?? null,
              leadId,
              waAccountId: waAccount?.id ?? null,
              lastMessageAt: now,
              lastMessagePreview: bodyText.slice(0, 140),
              lastInboundAt: now,
              unreadCount: 1,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: [conversations.contactPhone, conversations.waAccountId],
              set: {
                contactName: contact?.profile?.name ?? undefined,
                leadId: sql`coalesce(${conversations.leadId}, ${leadId})`,
                lastMessageAt: now,
                lastMessagePreview: bodyText.slice(0, 140),
                lastInboundAt: now,
                unreadCount: sql`${conversations.unreadCount} + 1`,
                updatedAt: now,
              },
            })
            .returning();

          await db.insert(messages).values({
            conversationId: convo.id,
            direction: "in",
            body: bodyText,
            waMessageId: msg.id,
            status: "received",
            type: midia?.ok ? midia.type : "text",
            mediaUrl: midia?.ok ? midia.mediaUrl : null,
            mimeType: midia?.ok ? midia.mimeType : null,
            fileName: midia?.ok ? midia.fileName : null,
          });
        }
      }
    }
  } catch (err) {
    console.error("WhatsApp webhook error:", err);
  }

  return NextResponse.json({ ok: true });
}
