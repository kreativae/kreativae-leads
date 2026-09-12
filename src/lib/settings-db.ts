import { db } from "@/db";
import { settings, waAccounts } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export const SETTING_KEYS = [
  "google_places_key",
  "data_source", // auto | osm | places
  "wa_verify_token",
  "wa_app_secret",
  "ig_access_token",
  "ig_user_id",
  "wa_enabled",
] as const;

/**
 * Chaves legadas de quando so um numero de WhatsApp era suportado. Fora do
 * SettingKey e da tela de Configuracoes de proposito: hoje so servem para
 * o migrador automatico de listWaAccounts() ler uma vez. Fica direto no
 * banco, sem passar pelo getSetting tipado.
 */
async function lerConfigLegadaWa(chave: string): Promise<string | null> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, chave))
    .limit(1);
  return row?.value ?? null;
}

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

/**
 * Interruptor do omnichannel. Ausente = ligado, para nao mudar o
 * comportamento de quem ja usava antes deste botao existir.
 */
export async function isWaEnabled(): Promise<boolean> {
  const v = await getSetting("wa_enabled");
  return v !== "no";
}

export interface IgConfig {
  accessToken: string;
  igUserId: string;
}

/** Credenciais do Instagram Business Discovery, ou null se nao configurado. */
export async function getIgConfig(): Promise<IgConfig | null> {
  const [accessToken, igUserId] = await Promise.all([
    getEffectiveSetting("ig_access_token", "IG_ACCESS_TOKEN"),
    getEffectiveSetting("ig_user_id", "IG_USER_ID"),
  ]);
  if (!accessToken || !igUserId) return null;
  return { accessToken, igUserId };
}

export interface WaAccount {
  id: string;
  label: string;
  phoneNumberId: string;
  wabaId: string | null;
  accessToken: string;
  displayPhone: string | null;
}

/**
 * Lista as contas de WhatsApp cadastradas. Se a tabela estiver vazia mas
 * existir a configuracao antiga (de quando so um numero era suportado),
 * migra ela pra primeira conta nesta mesma leitura — nao precisa de um
 * passo de migracao separado, e roda so uma vez (a proxima leitura ja acha
 * a tabela com linhas).
 */
export async function listWaAccounts(): Promise<WaAccount[]> {
  const linhas = await db.select().from(waAccounts).orderBy(asc(waAccounts.createdAt));
  if (linhas.length > 0) return linhas;

  const [phoneNumberId, wabaId, accessToken] = await Promise.all([
    lerConfigLegadaWa("wa_phone_number_id").then((v) => v ?? (process.env.WA_PHONE_NUMBER_ID?.trim() || null)),
    lerConfigLegadaWa("wa_waba_id"),
    lerConfigLegadaWa("wa_access_token").then((v) => v ?? (process.env.WA_ACCESS_TOKEN?.trim() || null)),
  ]);
  if (!phoneNumberId || !accessToken) return [];

  const [migrada] = await db
    .insert(waAccounts)
    .values({ label: "Principal", phoneNumberId, wabaId, accessToken })
    .onConflictDoNothing({ target: waAccounts.phoneNumberId })
    .returning();
  return migrada ? [migrada] : await db.select().from(waAccounts).orderBy(asc(waAccounts.createdAt));
}

export async function getWaAccount(id: string): Promise<WaAccount | null> {
  const [row] = await db.select().from(waAccounts).where(eq(waAccounts.id, id)).limit(1);
  return row ?? null;
}

export async function getWaAccountByPhoneNumberId(
  phoneNumberId: string,
): Promise<WaAccount | null> {
  const [row] = await db
    .select()
    .from(waAccounts)
    .where(eq(waAccounts.phoneNumberId, phoneNumberId))
    .limit(1);
  return row ?? null;
}

export async function createWaAccount(input: {
  label: string;
  phoneNumberId: string;
  wabaId: string | null;
  accessToken: string;
  displayPhone: string | null;
}): Promise<WaAccount> {
  const [row] = await db.insert(waAccounts).values(input).returning();
  return row;
}

export async function updateWaAccount(
  id: string,
  patch: Partial<{
    label: string;
    phoneNumberId: string;
    wabaId: string | null;
    accessToken: string;
    displayPhone: string | null;
  }>,
): Promise<WaAccount | null> {
  const [row] = await db
    .update(waAccounts)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(waAccounts.id, id))
    .returning();
  return row ?? null;
}

export async function deleteWaAccount(id: string): Promise<void> {
  await db.delete(waAccounts).where(eq(waAccounts.id, id));
}
