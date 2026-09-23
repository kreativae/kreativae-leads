import { NextResponse } from "next/server";
import { lerStatusVercel } from "@/lib/vercel-status";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  return NextResponse.json(await lerStatusVercel());
}
