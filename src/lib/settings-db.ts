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
  "debug_panel_enabled",
  "debug_easter_egg_enabled",
  "resend_api_key",
  "resend_from_email",
  "n8n_webhook_url",
  "n8n_callback_secret",
  "automation_mode", // n8n | interno
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

/**
 * Interruptor mestre do painel de debug (/configuracoes/logs) — FAB e
 * ícone escondido incluídos. Desligado, nada disso funciona, não importa
 * o toggle do easter egg abaixo. Ausente = ligado, já que a funcionalidade
 * já estava no ar quando este toggle foi criado.
 */
export async function isDebugPanelEnabled(): Promise<boolean> {
  const v = await getSetting("debug_panel_enabled");
  return v !== "no";
}

/**
 * Interruptor só do easter egg (ícone de bug quase invisível + sequência
 * secreta em Configurações). Independente do painel em si: com o painel
 * ligado e isto desligado, o único jeito de entrar continua sendo o FAB
 * visível — a "brincadeira" some, o recurso não.
 */
export async function isDebugEasterEggEnabled(): Promise<boolean> {
  const v = await getSetting("debug_easter_egg_enabled");
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

export interface N8nConfig {
  webhookUrl: string;
  callbackSecret: string;
}

/** Credenciais da automação via n8n, ou null se não configurado. */
export async function getN8nConfig(): Promise<N8nConfig | null> {
  const [webhookUrl, callbackSecret] = await Promise.all([
    getEffectiveSetting("n8n_webhook_url", "N8N_WEBHOOK_URL"),
    getEffectiveSetting("n8n_callback_secret", "N8N_CALLBACK_SECRET"),
  ]);
  if (!webhookUrl || !callbackSecret) return null;
  return { webhookUrl, callbackSecret };
}

export interface ResendConfig {
  apiKey: string;
  from: string;
}

export type AutomationMode = "n8n" | "interno";

/**
 * Como o botão "Automatizar" dispara: via n8n (webhook externo, decide o
 * canal e o texto) ou "interno" — o próprio sistema manda direto, com a
 * Abordagem pronta real. Ausente = "n8n", pra não mudar o comportamento de
 * quem já tinha isso configurado antes deste modo existir.
 */
export async function getAutomationMode(): Promise<AutomationMode> {
  const v = await getSetting("automation_mode");
  return v === "interno" ? "interno" : "n8n";
}

/** Credenciais do Resend (envio de e-mail), ou null se não configurado. */
export async function getResendConfig(): Promise<ResendConfig | null> {
  const [apiKey, from] = await Promise.all([
    getEffectiveSetting("resend_api_key", "RESEND_API_KEY"),
    getEffectiveSetting("resend_from_email", "RESEND_FROM_EMAIL"),
  ]);
  if (!apiKey || !from) return null;
  return { apiKey, from };
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
