import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditLogs, sessions, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { clientIp } from "./rate-limit";
import { SESSION_COOKIE } from "./auth-constants";

export { SESSION_COOKIE };
const SESSION_DAYS = 7;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  totpEnabled: boolean;
  mustChangePassword: boolean;
  sessionId: string;
}

function sha256(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

function isSecureContext(): boolean {
  return process.env.NODE_ENV === "production";
}

export function setSessionCookie(res: NextResponse, token: string, maxAgeSeconds: number) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecureContext(),
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: isSecureContext(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function createSession(opts: {
  userId: string;
  req: Request;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({
    tokenHash: sha256(token),
    userId: opts.userId,
    userAgent: (opts.req.headers.get("user-agent") ?? "").slice(0, 300) || null,
    ip: clientIp(opts.req),
    expiresAt,
  });
  return { token, expiresAt };
}

export async function destroySessionByToken(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
}

/** Reads the session cookie, validates against the database (hash-only lookup). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token || token.length < 32) return null;
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, sha256(token)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.session.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, row.session.id));
    return null;
  }
  // Touch lastSeen (sliding activity signal; absolute expiry stays fixed).
  if (Date.now() - row.session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    db.update(sessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(sessions.id, row.session.id))
      .catch(() => undefined);
  }
  return {
    id: row.user.id,
    name: row.user.name,
    email: row.user.email,
    role: row.user.role,
    totpEnabled: row.user.totpEnabled === "yes",
    mustChangePassword: row.user.mustChangePassword === "yes",
    sessionId: row.session.id,
  };
}

/** For API routes — returns the user or a ready-made 401 response. */
export async function requireUser(): Promise<
  { user: SessionUser; error: null } | { user: null; error: NextResponse }
> {
  const user = await getSessionUser();
  if (!user) {
    return {
      user: null,
      error: NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401 },
      ),
    };
  }
  return { user, error: null };
}

export async function requireOwner(): Promise<
  { user: SessionUser; error: null } | { user: null; error: NextResponse }
> {
  const auth = await requireUser();
  if (auth.error) return auth;
  if (auth.user.role !== "owner") {
    return {
      user: null,
      error: NextResponse.json(
        { ok: false, error: "Acesso restrito ao proprietário da conta." },
        { status: 403 },
      ),
    };
  }
  return auth;
}

export async function audit(event: {
  userId?: string | null;
  event: string;
  req: Request;
  detail?: string;
}): Promise<void> {
  await db
    .insert(auditLogs)
    .values({
      userId: event.userId ?? null,
      event: event.event,
      ip: clientIp(event.req),
      detail: event.detail?.slice(0, 300) ?? null,
    })
    .catch(() => undefined);
}
