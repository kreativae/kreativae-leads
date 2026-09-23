import { db } from "@/db";
import { settings, waAccounts } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { ANTHROPIC_MODELS } from "@/lib/anthropic-models";

export const SETTING_KEYS = [
  "google_places_key",
  "anthropic_api_key",
  "anthropic_admin_api_key",
  "anthropic_model",
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
  "automation_style", // "" (aleatório) | consultivo | direto | proximo | curto | pergunta
  "automation_include_about",
  "automation_wa_pause_ms",
  "automation_wa_template_br_name",
  "automation_wa_template_br_lang",
  "automation_wa_template_br_body",
  "automation_wa_template_pt_name",
  "automation_wa_template_pt_lang",
  "automation_wa_template_pt_body",
  "automation_wa_account_br",
  "automation_wa_account_pt",
  "automation_enabled",
  "vercel_api_token",
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

/** Modelo do Claude usado na aba IA — o recomendado (primeiro da lista) se nunca configurado. */
export async function getAnthropicModel(): Promise<string> {
  const v = await getEffectiveSetting("anthropic_model", "ANTHROPIC_MODEL");
  return v || ANTHROPIC_MODELS[0].id;
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
 * Interruptor do botão "Automatizar" do lead. Ausente = ligado, para nao
 * mudar o comportamento de quem ja usava antes deste botao existir.
 */
export async function isAutomationEnabled(): Promise<boolean> {
  const v = await getSetting("automation_enabled");
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

export interface ResendConfig {
  apiKey: string;
  from: string;
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

/**
 * Conta certa pra abrir um contato frio num idioma. Prioriza a escolha
 * explícita em Configurações → Automação; sem ela, casa Portugal pelo
 * `label` (precisa ter "portugal" no nome) e BR fica com qualquer conta que
 * NAO seja essa — funciona mesmo se a conta do Brasil ficou com o nome
 * padrão antigo ("Principal") em vez de "Brasil".
 */
export async function getWaAccountForLocale(locale: "BR" | "PT"): Promise<WaAccount | null> {
  const contas = await listWaAccounts();
  if (contas.length === 0) return null;

  const escolhidoId = await getSetting(
    locale === "PT" ? "automation_wa_account_pt" : "automation_wa_account_br",
  );
  if (escolhidoId) {
    const escolhido = contas.find((c) => c.id === escolhidoId);
    if (escolhido) return escolhido;
  }

  const pt = contas.find((c) => c.label.toLowerCase().includes("portugal"));
  if (locale === "PT") return pt ?? null;
  return contas.find((c) => c.id !== pt?.id) ?? null;
}

const AUTOMATION_STYLES = ["consultivo", "direto", "proximo", "curto", "pergunta"] as const;

const DEFAULT_WA_TEMPLATE_BODY: Record<"BR" | "PT", string> = {
  BR: "Olá! Sou da Kreativ.ae, estúdio de criação de sites. Vi a {{empresa}} e percebi que dá pra melhorar bastante a forma como o negócio aparece online. Topa ver algumas ideias rápidas, sem compromisso?",
  PT: "Olá! Sou da Kreativ.ae, estúdio especializado na criação de sites profissionais. Reparei que há espaço para melhorar a forma como a {{empresa}} aparece online. Topa ver algumas ideias rápidas, sem qualquer compromisso?",
};

export interface AutomationWaTemplate {
  name: string;
  language: string;
  bodyTemplate: string;
}

export interface AutomationSettings {
  /** null = deixa o gerador escolher um estilo pseudo-aleatorio por lead. */
  style: (typeof AUTOMATION_STYLES)[number] | null;
  includeAbout: boolean;
  /** Pausa entre partes de uma mensagem em varias bolhas, em ms. */
  waPauseMs: number;
  templates: Record<"BR" | "PT", AutomationWaTemplate>;
}

/** Config editavel em Configuracoes -> Automacao, com os mesmos padroes de sempre quando nada foi mudado. */
export async function getAutomationSettings(): Promise<AutomationSettings> {
  const [
    style,
    includeAbout,
    pauseMs,
    brName,
    brLang,
    brBody,
    ptName,
    ptLang,
    ptBody,
  ] = await Promise.all([
    getSetting("automation_style"),
    getSetting("automation_include_about"),
    getSetting("automation_wa_pause_ms"),
    getSetting("automation_wa_template_br_name"),
    getSetting("automation_wa_template_br_lang"),
    getSetting("automation_wa_template_br_body"),
    getSetting("automation_wa_template_pt_name"),
    getSetting("automation_wa_template_pt_lang"),
    getSetting("automation_wa_template_pt_body"),
  ]);

  const pauseParsed = pauseMs ? Number(pauseMs) : NaN;

  return {
    style: (AUTOMATION_STYLES as readonly string[]).includes(style ?? "")
      ? (style as AutomationSettings["style"])
      : null,
    includeAbout: includeAbout === "yes",
    waPauseMs: Number.isFinite(pauseParsed) && pauseParsed >= 0 ? pauseParsed : 15_000,
    templates: {
      BR: {
        name: brName || "modelo_br",
        language: brLang || "pt_BR",
        bodyTemplate: brBody || DEFAULT_WA_TEMPLATE_BODY.BR,
      },
      PT: {
        name: ptName || "modelo_pt",
        language: ptLang || "pt_PT",
        bodyTemplate: ptBody || DEFAULT_WA_TEMPLATE_BODY.PT,
      },
    },
  };
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
