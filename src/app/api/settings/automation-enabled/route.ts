import { NextResponse } from "next/server";
import { isAutomationEnabled } from "@/lib/settings-db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  return NextResponse.json({ enabled: await isAutomationEnabled() });
}
