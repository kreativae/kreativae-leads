import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const SETTING_KEYS = [
  "google_places_key",
  "data_source", // auto | osm | places
  "wa_access_token",
  "wa_phone_number_id",
  "wa_waba_id",
  "wa_verify_token",
  "wa_app_secret",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

export async function getSetting(key: SettingKey): Promise<string | null> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  return row?.value ?? null;
}

/** Database value takes precedence; falls back to env var. */
export async function getEffectiveSetting(
  key: SettingKey,
  envFallback?: string,
): Promise<string | null> {
  const v = await getSetting(key);
  if (v && v.trim()) return v.trim();
  const env = envFallback ? process.env[envFallback] : undefined;
  return env && env.trim() ? env.trim() : null;
}

export async function setSetting(
  key: SettingKey,
  value: string | null,
): Promise<void> {
  if (value === null) {
    await db.delete(settings).where(eq(settings.key, key));
    return;
  }
  await db
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() },
    });
}

export function maskSecret(v: string | null): string | null {
  if (!v) return null;
  if (v.length <= 4) return "••••";
  return "••••" + v.slice(-4);
}

export interface WaConfig {
  accessToken: string;
  phoneNumberId: string;
}

/** Returns WhatsApp Cloud API credentials or null if not configured. */
export async function getWaConfig(): Promise<WaConfig | null> {
  const [accessToken, phoneNumberId] = await Promise.all([
    getEffectiveSetting("wa_access_token", "WA_ACCESS_TOKEN"),
    getEffectiveSetting("wa_phone_number_id", "WA_PHONE_NUMBER_ID"),
  ]);
  if (!accessToken || !phoneNumberId) return null;
  return { accessToken, phoneNumberId };
}
