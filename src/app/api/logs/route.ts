import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { deleteOldLogs, listLogs, type LogSource } from "@/lib/system-log";

export const dynamic = "force-dynamic";

const SOURCES: LogSource[] = [
  "search",
  "instagram_lookup",
  "whatsapp_webhook",
  "enrich_queue",
  "wa_send",
  "automation",
];

export async function GET(req: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;

  const sp = new URL(req.url).searchParams;
  const sourceParam = sp.get("source");
  const statusParam = sp.get("status");
  const source = SOURCES.find((s) => s === sourceParam);
  const status = statusParam === "ok" || statusParam === "error" ? statusParam : undefined;

  const rows = await listLogs({ source, status, limit: 300 });
  return NextResponse.json({ ok: true, logs: rows });
}

export async function DELETE(req: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;

  const sp = new URL(req.url).searchParams;
  const dias = Math.max(1, Math.min(365, parseInt(sp.get("olderThanDays") ?? "30", 10) || 30));
  const removidos = await deleteOldLogs(dias);
  return NextResponse.json({ ok: true, removidos });
}
