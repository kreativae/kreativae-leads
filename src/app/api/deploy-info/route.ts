import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Avaliado uma vez quando a função serverless "esquenta" — dá uma ideia de
// desde quando essa instância do build está no ar (não é o horário exato
// do deploy, mas é o suficiente pra confirmar "isso aqui é recente ou é
// uma versão presa em cache").
const BOOTED_AT = new Date().toISOString();

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  return NextResponse.json({
    ok: true,
    sha,
    shortSha: sha?.slice(0, 7) ?? null,
    message: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
    ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    env: process.env.VERCEL_ENV ?? "development",
    bootedAt: BOOTED_AT,
  });
}
