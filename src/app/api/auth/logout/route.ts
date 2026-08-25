import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { audit, clearSessionCookie, destroySessionByToken, getSessionUser, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getSessionUser();
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await destroySessionByToken(token);
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  if (user) await audit({ userId: user.id, event: "logout", req });
  return res;
}
