import { NextResponse } from "next/server";
import {
  SETTING_KEYS,
  getSetting,
  maskSecret,
  setSetting,
  getWaConfig,
  type SettingKey,
} from "@/lib/settings-db";
import { getIgConfig } from "@/lib/settings-db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SECRET_KEYS: SettingKey[] = [
  "google_places_key",
  "wa_access_token",
  "wa_app_secret",
  "ig_access_token",
];

const ENV_HINT: Partial<Record<SettingKey, string>> = {
  google_places_key: "GOOGLE_PLACES_API_KEY",
  wa_access_token: "WA_ACCESS_TOKEN",
  wa_phone_number_id: "WA_PHONE_NUMBER_ID",
  wa_verify_token: "WA_VERIFY_TOKEN",
  ig_access_token: "IG_ACCESS_TOKEN",
  ig_user_id: "IG_USER_ID",
};

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const out: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) {
    const raw = await getSetting(key);
    const envKey = ENV_HINT[key];
    const envVal = envKey ? process.env[envKey] : undefined;
    const effective = (raw && raw.trim()) || (envVal && envVal.trim()) || null;
    out[key] = SECRET_KEYS.includes(key)
      ? { set: !!effective, masked: maskSecret(effective), fromEnv: !raw && !!envVal }
      : { value: raw ?? "", fromEnv: !raw && !!envVal };
  }
  out.wa_configured = !!(await getWaConfig());
  out.ig_configured = !!(await getIgConfig());
  return NextResponse.json(out);
}

export async function PUT(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  for (const [key, raw] of Object.entries(body)) {
    if (!SETTING_KEYS.includes(key as SettingKey)) continue;
    if (typeof raw !== "string") continue;
    const v = raw.trim();
    // Empty or masked values keep the stored secret; explicit token deletes it.
    if (v === "__DELETE__") await setSetting(key as SettingKey, null);
    else if (v && !v.startsWith("••••")) await setSetting(key as SettingKey, v);
    else if (!SECRET_KEYS.includes(key as SettingKey))
      await setSetting(key as SettingKey, null);
  }
  return NextResponse.json({ ok: true });
}
