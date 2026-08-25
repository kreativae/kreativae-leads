import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { count } from "drizzle-orm";
import { checkPassword, hashPassword } from "@/lib/password";
import { audit, createSession, setSessionCookie } from "@/lib/auth";
import { assertSameOrigin, clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Initial account setup: allowed only while there are zero users. */
export async function GET() {
  const [row] = await db.select({ n: count() }).from(users);
  return NextResponse.json({ canRegister: (row?.n ?? 0) === 0 });
}

export async function POST(req: Request) {
  if (!assertSameOrigin(req))
    return NextResponse.json({ ok: false, error: "Origem inválida." }, { status: 403 });

  const ip = clientIp(req);
  const limited = rateLimit(`register:ip:${ip}`, 10, 60 * 60);
  if (limited !== null)
    return NextResponse.json(
      { ok: false, error: "Muitas tentativas. Aguarde e tente mais tarde." },
      { status: 429 },
    );

  const [row] = await db.select({ n: count() }).from(users);
  if ((row?.n ?? 0) > 0)
    return NextResponse.json(
      {
        ok: false,
        error:
          "O sistema já possui uma conta. Novos usuários são criados pelo proprietário em Configurações → Equipe.",
      },
      { status: 403 },
    );

  let body: { name?: unknown; email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (name.length < 2 || name.length > 80)
    return NextResponse.json({ ok: false, error: "Informe seu nome." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
    return NextResponse.json({ ok: false, error: "E-mail inválido." }, { status: 400 });

  const pw = checkPassword(password);
  if (!pw.ok)
    return NextResponse.json(
      { ok: false, error: "Senha fraca: " + pw.errors.join("; ") },
      { status: 400 },
    );

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ name, email, passwordHash, role: "owner" })
    .returning();

  await audit({ userId: user.id, event: "account_created_owner", req });
  const { token, expiresAt } = await createSession({ userId: user.id, req });
  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
  setSessionCookie(res, token, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return res;
}
