import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/db";
import { conversations, leads, messages } from "@/db/schema";
import { and, eq, ilike, isNotNull, sql } from "drizzle-orm";
import { getEffectiveSetting } from "@/lib/settings-db";

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
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: {
          from?: string;
          id?: string;
          type?: string;
          text?: { body?: string };
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

  const appSecret = await getEffectiveSetting("wa_app_secret", "WA_APP_SECRET");
  if (appSecret) {
    const sig = req.headers.get("x-hub-signature-256");
    if (!verifySignature(raw, sig, appSecret)) {
      return NextResponse.json({ ok: false, error: "Assinatura inválida." }, { status: 401 });
    }
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
        for (const msg of value.messages ?? []) {
          if (!msg.from || !msg.id) continue;
          const phone = msg.from.replace(/\D+/g, "");
          const contact = value.contacts?.find((c) => c.wa_id === phone);
          const bodyText =
            msg.type === "text"
              ? (msg.text?.body ?? "")
              : `[${msg.type ?? "mídia"} recebida]`;

          // Dedup by waMessageId (Meta may retry webhooks)
          const existing = await db
            .select({ id: messages.id })
            .from(messages)
            .where(eq(messages.waMessageId, msg.id))
            .limit(1);
          if (existing.length > 0) continue;

          const leadId = await findLeadByPhone(phone);
          const now = new Date();

          const [convo] = await db
            .insert(conversations)
            .values({
              contactPhone: phone,
              contactName: contact?.profile?.name ?? null,
              leadId,
              lastMessageAt: now,
              lastMessagePreview: bodyText.slice(0, 140),
              lastInboundAt: now,
              unreadCount: 1,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: conversations.contactPhone,
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
          });
        }
      }
    }
  } catch (err) {
    console.error("WhatsApp webhook error:", err);
  }

  return NextResponse.json({ ok: true });
}
