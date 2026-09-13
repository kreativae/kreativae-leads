import { NextResponse } from "next/server";
import { db } from "@/db";
import { webauthnCredentials } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { requireUser, audit } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const rows = await db
    .select({
      id: webauthnCredentials.id,
      label: webauthnCredentials.label,
      deviceType: webauthnCredentials.deviceType,
      createdAt: webauthnCredentials.createdAt,
      lastUsedAt: webauthnCredentials.lastUsedAt,
    })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, auth.user.id))
    .orderBy(desc(webauthnCredentials.createdAt));

  return NextResponse.json({ ok: true, credentials: rows });
}

export async function DELETE(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "ID ausente." }, { status: 400 });

  const [removed] = await db
    .delete(webauthnCredentials)
    .where(and(eq(webauthnCredentials.id, id), eq(webauthnCredentials.userId, auth.user.id)))
    .returning();
  if (!removed)
    return NextResponse.json({ ok: false, error: "Chave não encontrada." }, { status: 404 });

  await audit({ userId: auth.user.id, event: "webauthn_removed", req, detail: removed.label });
  return NextResponse.json({ ok: true });
}
