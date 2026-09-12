import { NextResponse } from "next/server";
import { lerCustoWhatsApp } from "@/lib/wa-cost";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const custo = await lerCustoWhatsApp();
  return NextResponse.json(custo);
}
