import { NextResponse } from "next/server";
import { lerGastoMensalAnthropic } from "@/lib/anthropic-admin";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const gasto = await lerGastoMensalAnthropic();
  return NextResponse.json(gasto);
}
