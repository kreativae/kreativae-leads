"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AtSign,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Database,
  Globe2,
  Info,
  KeyRound,
  Loader2,
  Mail,
  MessageSquare,
  Palette,
  Pencil,
  Phone,
  Plus,
  Receipt,
  RefreshCw,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  Webhook,
  Zap,
  X,
} from "lucide-react";
import { ThemeSelector } from "@/components/theme";
import { TeamSection } from "@/components/team-section";
import { SecretDebugTrigger, DebugFab } from "@/components/secret-debug-trigger";
import { formatDate } from "@/lib/format";
import { MESSAGE_STYLES } from "@/lib/messages";
import { ANTHROPIC_MODELS } from "@/lib/anthropic-models";

interface MeRole {
  role: string;
}

function useIsOwner(): boolean {
  const [owner, setOwner] = useState(false);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { user: MeRole } | null) => setOwner(d?.user?.role === "owner"))
      .catch(() => undefined);
  }, []);
  return owner;
}

/** Controlados em Conta → só o proprietário liga/desliga; padrão ligado. */
function useDebugToggles(): {
  panelEnabled: boolean;
  easterEggEnabled: boolean;
} {
  const [state, setState] = useState({
    panelEnabled: true,
    easterEggEnabled: true,
  });
  useEffect(() => {
    fetch("/api/settings/debug-toggle")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { panelEnabled?: boolean; easterEggEnabled?: boolean } | null) => {
        if (!d) return;
        setState({
          panelEnabled: d.panelEnabled ?? true,
          easterEggEnabled: d.easterEggEnabled ?? true,
        });
      })
      .catch(() => undefined);
  }, []);
  return state;
}

interface SecretMeta {
  set?: boolean;
  masked?: string | null;
  fromEnv?: boolean;
}
interface PlainMeta {
  value?: string;
  fromEnv?: boolean;
}
interface CustoPlaces {
  requisicoes: number;
  desde: string | null;
  precoPorRequisicao: number;
  custoUsd: number;
}
interface CustoAnthropicModelo {
  modelId: string;
  label: string;
  noCacheInputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  calls: number;
  custoUsd: number;
}
interface CustoAnthropic {
  desde: string | null;
  modelos: CustoAnthropicModelo[];
  custoUsd: number;
}
type GastoMensalAnthropic =
  | { ok: true; totalUsd: number; desde: string; ate: string }
  | { ok: false; error: string };
interface CustoWhatsAppConta {
  accountId: string;
  label: string;
  displayPhone: string | null;
  ok: boolean;
  erro?: string;
  conversas: number;
  custo: number;
}
interface CustoWhatsApp {
  contas: CustoWhatsAppConta[];
  totalConversas: number;
  totalCusto: number;
  periodoDias: number;
  desde: string;
  ate: string;
}
interface AutomationDefaults {
  style: string | null;
  includeAbout: boolean;
  waPauseMs: number;
  templates: Record<"BR" | "PT", { name: string; language: string; bodyTemplate: string }>;
}

type SettingsMeta = Record<string, SecretMeta & PlainMeta> & {
  wa_configured?: boolean;
  ig_configured?: boolean;
  resend_configured?: boolean;
  places_cost?: CustoPlaces;
  anthropic_cost?: CustoAnthropic;
  automation_defaults?: AutomationDefaults;
};

/** Interruptor simples. Salva na hora — nao espera o botao Salvar. */
function Toggle({
  on,
  onChange,
  label,
  hint,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.07] bg-ink/60 px-4 py-3">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-zinc-100">{label}</div>
        <div className="mt-0.5 text-[11.5px] leading-relaxed text-zinc-500">{hint}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          on ? "bg-volt" : "bg-white/25"
        }`}
      >
        <span
          className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-[#fff] shadow transition-transform ${
            on ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

/**
 * Nota/limitação que so aparece quando clicada — os avisos amarelos fixos
 * (Meta, Instagram, WhatsApp) pareciam alertas de algo errado por estarem
 * sempre abertos, quando so sao informativos.
 */
function NotaInfo({ children }: { children: React.ReactNode }) {
  const [aberta, setAberta] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-zinc-500 transition-colors hover:text-zinc-300"
      >
        <Info className="h-3.5 w-3.5" />
        Nota
      </button>
      {aberta && (
        <p className="mt-2 rounded-lg border border-amber-300/20 bg-amber-300/[0.06] px-3.5 py-2.5 text-[12px] leading-relaxed text-amber-200/80">
          {children}
        </p>
      )}
    </div>
  );
}

/**
 * Painel de instruções ("Como conectar"/"Como funciona") — fechado por
 * padrão. Igual à NotaInfo: quando fechado, some por completo (só o
 * botãozinho fica), em vez de deixar uma caixa vazia sempre visível.
 */
function InstrucoesPanel({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Webhook;
  title: string;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-zinc-500 transition-colors hover:text-zinc-300"
      >
        <Icon className="h-3.5 w-3.5" />
        {title}
      </button>
      {aberto && (
        <div className="mt-2 rounded-xl border border-white/[0.07] bg-ink/60 p-5">{children}</div>
      )}
    </div>
  );
}

/** Template do WhatsApp por idioma: nome/idioma/corpo aprovados na Meta + qual conta usar. */
function WaTemplateEditor({
  titulo,
  nome,
  idioma,
  corpo,
  contaId,
  contas,
  onNome,
  onIdioma,
  onCorpo,
  onConta,
}: {
  titulo: string;
  nome: string;
  idioma: string;
  corpo: string;
  contaId: string;
  contas: { id: string; label: string }[];
  onNome: (v: string) => void;
  onIdioma: (v: string) => void;
  onCorpo: (v: string) => void;
  onConta: (v: string) => void;
}) {
  return (
    <div className="space-y-3.5 rounded-xl border border-white/[0.07] bg-ink/60 p-5">
      <p className="text-[13px] font-bold text-zinc-100">{titulo}</p>
      <PlainInput label="Nome do template" hint="Como foi salvo no WhatsApp Manager." value={nome} onChange={onNome} />
      <PlainInput
        label="Idioma"
        hint="Código do idioma aprovado (ex.: pt_BR)."
        value={idioma}
        onChange={onIdioma}
      />
      <div>
        <label className="text-[12px] font-semibold text-zinc-400">Corpo do template</label>
        <textarea
          value={corpo}
          onChange={(e) => onCorpo(e.target.value)}
          rows={4}
          className="mt-1.5 w-full rounded-xl border border-white/[0.09] bg-ink px-4 py-3 text-[12.5px] leading-relaxed text-zinc-100 outline-none focus:border-volt/50"
        />
        <p className="mt-1 text-[11.5px] text-zinc-600">
          Use {"{{empresa}}"} onde entra o nome da empresa — precisa bater com o corpo aprovado
          na Meta.
        </p>
      </div>
      <div>
        <label className="text-[12px] font-semibold text-zinc-400">Conta de WhatsApp</label>
        <select
          value={contaId}
          onChange={(e) => onConta(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-white/[0.09] bg-ink px-4 py-3 text-[13.5px] text-zinc-100 outline-none focus:border-volt/50"
        >
          <option value="">Detectar automaticamente</option>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

const SECRET_FIELDS = [
  "google_places_key",
  "wa_app_secret",
  "ig_access_token",
  "resend_api_key",
  "anthropic_api_key",
  "anthropic_admin_api_key",
];
const PLAIN_FIELDS = [
  "wa_verify_token",
  "anthropic_model",
  "data_source",
  "ig_user_id",
  "resend_from_email",
  "automation_style",
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
];

export default function ConfiguracoesPage() {
  const [meta, setMeta] = useState<SettingsMeta>({});
  const [values, setValues] = useState<Record<string, string>>({
    google_places_key: "",
    anthropic_api_key: "",
    anthropic_admin_api_key: "",
    anthropic_model: ANTHROPIC_MODELS[0].id,
    data_source: "auto",
    wa_verify_token: "",
    wa_app_secret: "",
    ig_access_token: "",
    ig_user_id: "",
    wa_enabled: "yes",
    resend_api_key: "",
    resend_from_email: "",
    automation_enabled: "yes",
    automation_style: "",
    automation_include_about: "no",
    automation_wa_pause_ms: "1400",
    automation_wa_template_br_name: "modelo_br",
    automation_wa_template_br_lang: "pt_BR",
    automation_wa_template_br_body: "",
    automation_wa_template_pt_name: "modelo_pt",
    automation_wa_template_pt_lang: "pt_PT",
    automation_wa_template_pt_body: "",
    automation_wa_account_br: "",
    automation_wa_account_pt: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [salvandoToken, setSalvandoToken] = useState(false);
  const [origin, setOrigin] = useState("");
  const [waCusto, setWaCusto] = useState<CustoWhatsApp | null>(null);
  const [waCustoErro, setWaCustoErro] = useState<string | null>(null);
  const [waCustoCarregando, setWaCustoCarregando] = useState(true);
  const [gastoAnthropic, setGastoAnthropic] = useState<GastoMensalAnthropic | null>(null);
  const [gastoAnthropicCarregando, setGastoAnthropicCarregando] = useState(true);
  const [mostrarCustoIa, setMostrarCustoIa] = useState(false);

  useEffect(() => {
    try {
      setMostrarCustoIa(localStorage.getItem("configuracoes_mostrar_custo_ia") === "1");
    } catch {
      /* localStorage indisponível — fica oculto por padrão, sem quebrar nada */
    }
  }, []);

  function alternarMostrarCustoIa(v: boolean) {
    setMostrarCustoIa(v);
    try {
      localStorage.setItem("configuracoes_mostrar_custo_ia", v ? "1" : "0");
    } catch {
      /* localStorage indisponível — o toggle só não persiste */
    }
  }
  const [waAccountsList, setWaAccountsList] = useState<{ id: string; label: string }[]>([]);
  const isOwner = useIsOwner();
  const { panelEnabled, easterEggEnabled } = useDebugToggles();

  const carregarCustoWhatsApp = useCallback(async () => {
    setWaCustoCarregando(true);
    setWaCustoErro(null);
    try {
      const res = await fetch("/api/settings/wa-cost");
      if (!res.ok) throw new Error();
      setWaCusto((await res.json()) as CustoWhatsApp);
    } catch {
      setWaCustoErro("Não foi possível consultar a Meta agora.");
    } finally {
      setWaCustoCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarCustoWhatsApp();
  }, [carregarCustoWhatsApp]);

  const carregarGastoAnthropic = useCallback(async () => {
    setGastoAnthropicCarregando(true);
    try {
      const res = await fetch("/api/settings/anthropic-cost");
      setGastoAnthropic((await res.json()) as GastoMensalAnthropic);
    } catch {
      setGastoAnthropic({ ok: false, error: "Erro de rede ao consultar a Anthropic." });
    } finally {
      setGastoAnthropicCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarGastoAnthropic();
  }, [carregarGastoAnthropic]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      const data = (await res.json()) as SettingsMeta;
      setMeta(data);
      const auto = data.automation_defaults;
      setValues((v) => ({
        ...v,
        data_source: data.data_source?.value || "auto",
        anthropic_model: data.anthropic_model?.value || ANTHROPIC_MODELS[0].id,
        wa_verify_token: data.wa_verify_token?.value ?? "",
        ig_user_id: data.ig_user_id?.value ?? "",
        resend_from_email: data.resend_from_email?.value ?? "",
        wa_enabled: data.wa_enabled?.value === "no" ? "no" : "yes",
        automation_enabled: data.automation_enabled?.value === "no" ? "no" : "yes",
        automation_style: data.automation_style?.value ?? "",
        automation_include_about: data.automation_include_about?.value === "yes" ? "yes" : "no",
        automation_wa_pause_ms:
          data.automation_wa_pause_ms?.value || String(auto?.waPauseMs ?? 1400),
        automation_wa_template_br_name:
          data.automation_wa_template_br_name?.value || auto?.templates.BR.name || "modelo_br",
        automation_wa_template_br_lang:
          data.automation_wa_template_br_lang?.value || auto?.templates.BR.language || "pt_BR",
        automation_wa_template_br_body:
          data.automation_wa_template_br_body?.value || auto?.templates.BR.bodyTemplate || "",
        automation_wa_template_pt_name:
          data.automation_wa_template_pt_name?.value || auto?.templates.PT.name || "modelo_pt",
        automation_wa_template_pt_lang:
          data.automation_wa_template_pt_lang?.value || auto?.templates.PT.language || "pt_PT",
        automation_wa_template_pt_body:
          data.automation_wa_template_pt_body?.value || auto?.templates.PT.bodyTemplate || "",
        automation_wa_account_br: data.automation_wa_account_br?.value ?? "",
        automation_wa_account_pt: data.automation_wa_account_pt?.value ?? "",
      }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    setOrigin(window.location.origin);
  }, [load]);

  useEffect(() => {
    fetch("/api/wa-accounts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { accounts: { id: string; label: string }[] } | null) =>
        setWaAccountsList(d?.accounts ?? []),
      )
      .catch(() => undefined);
  }, []);

  async function save() {
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      for (const k of SECRET_FIELDS) if (values[k]) payload[k] = values[k];
      for (const k of PLAIN_FIELDS) payload[k] = values[k] ?? "";
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setValues((v) => ({
        ...v,
        google_places_key: "",
        anthropic_api_key: "",
        anthropic_admin_api_key: "",
        wa_access_token: "",
        wa_app_secret: "",
        ig_access_token: "",
      }));
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2500);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function setWaEnabled(on: boolean) {
    setValues((s) => ({ ...s, wa_enabled: on ? "yes" : "no" }));
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wa_enabled: on ? "yes" : "no" }),
    });
    await load();
    // O menu lateral so recarrega o estado a cada 15s; recarregar a pagina
    // faz a aba Conversas aparecer/sumir na hora.
    window.location.reload();
  }

  async function setAutomationEnabled(on: boolean) {
    setValues((s) => ({ ...s, automation_enabled: on ? "yes" : "no" }));
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ automation_enabled: on ? "yes" : "no" }),
    });
    await load();
  }

  async function removeSecret(key: string) {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: "__DELETE__" }),
    });
    await load();
  }

  async function copy(text: string, tag: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      window.prompt("Copie:", text);
    }
  }

  /**
   * Gera E grava. O painel ao lado mostra o token para copiar assim que ele
   * aparece; se dependesse do botao Salvar, era possivel colar na Meta um
   * valor que o servidor nunca recebeu — e a verificacao falharia sem pista.
   */
  async function generateVerifyToken() {
    const t = `kreatae-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
    setValues((v) => ({ ...v, wa_verify_token: t }));
    setSalvandoToken(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wa_verify_token: t }),
      });
      await load();
    } finally {
      setSalvandoToken(false);
    }
  }

  const webhookUrl = origin ? `${origin}/api/webhooks/whatsapp` : "/api/webhooks/whatsapp";

  return (
    <div className="space-y-6">
      {panelEnabled && easterEggEnabled && <SecretDebugTrigger />}
      <DebugFab visible={isOwner && panelEnabled} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
            <Settings2 className="h-3.5 w-3.5" />
            Painel
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
            Configurações
          </h1>
          <p className="mt-2 max-w-2xl text-[14.5px] text-zinc-400">
            APIs, tokens e aparência. Tudo fica salvo no banco local da ferramenta —
            variáveis de ambiente, quando existem, continuam valendo como padrão.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-full bg-volt px-6 py-3 text-[13.5px] font-bold text-onvolt transition-transform hover:scale-[1.03] disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : savedAt ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {savedAt ? "Salvo!" : "Salvar alterações"}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-volt" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* Aparência */}
          <Section
            icon={Palette}
            title="Aparência"
            desc="Tema da interface para toda a equipe deste navegador."
            className="xl:col-span-2"
          >
            <ThemeSelector />
          </Section>

          {/* Fonte de dados */}
          <Section
            icon={Database}
            title="Fonte de dados dos leads"
            desc="De onde vêm as empresas nas varreduras."
          >
            <label className="text-[12px] font-semibold text-zinc-400">
              Prioridade de busca
            </label>
            <select
              value={values.data_source}
              onChange={(e) => setValues((v) => ({ ...v, data_source: e.target.value }))}
              className="mt-1.5 w-full rounded-xl border border-white/[0.09] bg-ink px-4 py-3 text-[13.5px] text-zinc-100 outline-none focus:border-volt/50"
            >
              <option value="auto">Automática — Google Places se houver chave, senão OpenStreetMap</option>
              <option value="places">Sempre Google Places</option>
              <option value="osm">Sempre OpenStreetMap</option>
            </select>

            <div className="mt-4">
              <SecretInput
                label="Google Places API Key"
                hint="Crie no Google Cloud → APIs → Places API (New). Até ~60 empresas por busca, com telefone e site."
                masked={meta.google_places_key?.masked}
                fromEnv={meta.google_places_key?.fromEnv}
                value={values.google_places_key}
                onChange={(v) => setValues((s) => ({ ...s, google_places_key: v }))}
                onRemove={() => removeSecret("google_places_key")}
              />
            </div>

            <div className="mt-3.5 flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5 text-[12px] text-zinc-500">
              <Globe2 className="h-3.5 w-3.5 shrink-0 text-volt" />
              OpenStreetMap: gratuito, sem chave, com 3 espelhos de contingência.
            </div>
          </Section>

          {/* IA (análise de prints de anúncio) */}
          <Section
            icon={Sparkles}
            title="IA (análise de anúncios)"
            desc="Usada na aba IA pra ler os prints de anúncio que você sobe."
          >
            <SecretInput
              label="Anthropic API Key"
              hint="Crie em console.anthropic.com → API Keys. Chamada direta à API da Claude, sem depender do AI Gateway da Vercel."
              masked={meta.anthropic_api_key?.masked}
              fromEnv={meta.anthropic_api_key?.fromEnv}
              value={values.anthropic_api_key}
              onChange={(v) => setValues((s) => ({ ...s, anthropic_api_key: v }))}
              onRemove={() => removeSecret("anthropic_api_key")}
            />
            <div className="mt-4">
              <label className="text-[12px] font-semibold text-zinc-400">Modelo usado na consulta</label>
              <select
                value={values.anthropic_model}
                onChange={(e) => setValues((v) => ({ ...v, anthropic_model: e.target.value }))}
                className="mt-1.5 w-full rounded-xl border border-white/[0.09] bg-ink px-4 py-3 text-[13.5px] text-zinc-100 outline-none focus:border-volt/50"
              >
                {ANTHROPIC_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} — {m.hint}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-4">
              <Toggle
                on={mostrarCustoIa}
                onChange={alternarMostrarCustoIa}
                label="Gasto real da IA (Admin API)"
                hint="Liga pra configurar a Admin API Key e mostrar o card de custo real no final da página. Desliga pra esconder os dois."
              />
              {mostrarCustoIa && (
                <div className="mt-4">
                  <SecretInput
                    label="Anthropic Admin API Key"
                    hint="Crie em console.anthropic.com → Organização → Admin API Keys (só um admin da organização consegue). Chave diferente da de cima — só serve pra puxar o gasto real do mês no card de custo abaixo."
                    masked={meta.anthropic_admin_api_key?.masked}
                    fromEnv={meta.anthropic_admin_api_key?.fromEnv}
                    value={values.anthropic_admin_api_key}
                    onChange={(v) => setValues((s) => ({ ...s, anthropic_admin_api_key: v }))}
                    onRemove={() => removeSecret("anthropic_admin_api_key")}
                  />
                </div>
              )}
            </div>
          </Section>

          {/* WhatsApp Cloud API */}
          <Section
            icon={MessageSquare}
            title="WhatsApp Cloud API (omnichannel)"
            desc="Conecta o número oficial da empresa para receber e responder conversas aqui dentro."
          >
            <div className="space-y-4">
              <Toggle
                on={values.wa_enabled !== "no"}
                onChange={setWaEnabled}
                label="Omnichannel ativo"
                hint="Desligado, a aba Conversas some do menu e o WhatsApp fica fora do fluxo."
              />
              <WaAccountsManager />
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[12px] font-semibold text-zinc-400">
                    Verify Token do webhook
                  </label>
                  <button
                    type="button"
                    onClick={generateVerifyToken}
                    className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-volt hover:underline"
                  >
                    <RefreshCw className={`h-3 w-3 ${salvandoToken ? "animate-spin" : ""}`} />
                    {salvandoToken ? "Salvando…" : "Gerar e salvar"}
                  </button>
                </div>
                <input
                  value={values.wa_verify_token}
                  onChange={(e) => setValues((s) => ({ ...s, wa_verify_token: e.target.value }))}
                  placeholder="ex.: kreatae-x9f2…"
                  className="mt-1.5 w-full rounded-xl border border-white/[0.09] bg-ink px-4 py-3 font-mono text-[12.5px] text-zinc-100 outline-none focus:border-volt/50"
                />
              </div>
              <SecretInput
                label="App Secret (obrigatório)"
                hint="Valida a assinatura dos webhooks. Sem ele o webhook recusa todo payload."
                masked={meta.wa_app_secret?.masked}
                value={values.wa_app_secret}
                onChange={(v) => setValues((s) => ({ ...s, wa_app_secret: v }))}
                onRemove={() => removeSecret("wa_app_secret")}
              />

              <InstrucoesPanel icon={Webhook} title="Como conectar na Meta">
                <ol className="list-decimal space-y-2 pl-4 text-[12.5px] leading-relaxed text-zinc-400">
                  <li>Crie um app em <span className="text-zinc-200">developers.facebook.com</span> e adicione o produto <span className="text-zinc-200">WhatsApp</span>.</li>
                  <li>Em <span className="text-zinc-200">API Setup</span>, copie o token permanente e o Phone Number ID e clique em <span className="text-zinc-200">Adicionar número</span> ao lado.</li>
                  <li>Em <span className="text-zinc-200">Configuration → Webhook</span>, cadastre a URL abaixo com o Verify Token definido aqui — isso vale para todos os números, é o mesmo app da Meta.</li>
                </ol>
                <CopyRow
                  label="URL de callback"
                  value={webhookUrl}
                  copied={copied === "url"}
                  onCopy={() => copy(webhookUrl, "url")}
                />
                <CopyRow
                  label={
                    values.wa_verify_token && !meta.wa_verify_token?.value
                      ? "Verify Token — ainda não salvo"
                      : "Verify Token"
                  }
                  value={values.wa_verify_token || "(gere um token)"}
                  copied={copied === "vt"}
                  onCopy={() => copy(values.wa_verify_token, "vt")}
                />
                <ol start={4} className="mt-2 list-decimal space-y-2 pl-4 text-[12.5px] leading-relaxed text-zinc-400">
                  <li>Assine o campo <span className="text-zinc-200">messages</span> no webhook.</li>
                  <li>No Business Settings, dê acesso à conta do WhatsApp (WABA) para o system user do app.</li>
                  <li>Pronto: mensagens recebidas aparecem na aba <span className="text-zinc-200">Conversas</span> e são vinculadas aos leads automaticamente — a resposta sai pelo número certo, mesmo com mais de um cadastrado.</li>
                </ol>
                <NotaInfo>
                  Nota da Meta: fora da janela de 24h após a última mensagem do cliente,
                  a API exige mensagens de template pré-aprovadas.
                </NotaInfo>
              </InstrucoesPanel>
            </div>
          </Section>

          {/* Instagram Business Discovery */}
          <Section
            icon={AtSign}
            title="Instagram (qualificação de leads)"
            desc="Busca seguidores e bio dos perfis já descobertos no enriquecimento."
          >
            <div className="space-y-4">
              <SecretInput
                label="Access Token (Meta)"
                hint="Mesmo app do WhatsApp, com instagram_basic e instagram_manage_insights."
                masked={meta.ig_access_token?.masked}
                fromEnv={meta.ig_access_token?.fromEnv}
                value={values.ig_access_token}
                onChange={(v) => setValues((s) => ({ ...s, ig_access_token: v }))}
                onRemove={() => removeSecret("ig_access_token")}
              />
              <PlainInput
                label="ID da sua conta Instagram Business"
                hint="O ID da SUA conta — é por ela que a API consulta os perfis dos leads."
                value={values.ig_user_id}
                onChange={(v) => setValues((s) => ({ ...s, ig_user_id: v }))}
                fromEnv={meta.ig_user_id?.fromEnv}
              />
              <InstrucoesPanel icon={AtSign} title="Como funciona">
                <ol className="list-decimal space-y-2 pl-4 text-[12.5px] leading-relaxed text-zinc-400">
                  <li>O <span className="text-zinc-200">enriquecimento</span> descobre o @perfil no site do lead.</li>
                  <li>Com as credenciais acima, o botão <span className="text-zinc-200">Buscar seguidores</span> consulta a API da Meta.</li>
                  <li>Leads com muitos seguidores <span className="text-zinc-200">e sem site</span> viram prioridade de abordagem.</li>
                </ol>
                <NotaInfo>
                  Limitação da Meta: só retorna dados de contas <span className="font-semibold">Business ou Creator</span>.
                  Perfis pessoais ficam sem seguidores — e não existe busca por cidade ou
                  segmento, apenas consulta por @perfil já conhecido.
                </NotaInfo>
              </InstrucoesPanel>
            </div>
          </Section>

          {/* E-mail transacional (Resend) */}
          <Section
            icon={Mail}
            title="E-mail (Resend)"
            desc="Envio de e-mails automatizados — usado por automações e futuras notificações."
            className="xl:col-span-2"
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-4">
                <SecretInput
                  label="API Key"
                  hint="Gerada em resend.com/api-keys."
                  masked={meta.resend_api_key?.masked}
                  fromEnv={meta.resend_api_key?.fromEnv}
                  value={values.resend_api_key}
                  onChange={(v) => setValues((s) => ({ ...s, resend_api_key: v }))}
                  onRemove={() => removeSecret("resend_api_key")}
                />
                <PlainInput
                  label="Endereço de envio (From)"
                  hint="Precisa ser de um domínio verificado no Resend — ex.: leads@kreativ.ae."
                  value={values.resend_from_email}
                  onChange={(v) => setValues((s) => ({ ...s, resend_from_email: v }))}
                  fromEnv={meta.resend_from_email?.fromEnv}
                />
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-ink/60 p-5">
                <div className="flex items-center gap-2 text-[13px] font-bold text-zinc-100">
                  <Mail className="h-4 w-4 text-volt" />
                  Estado
                </div>
                <p className="mt-3 text-[12.5px] leading-relaxed text-zinc-400">
                  {meta.resend_configured
                    ? "Configurado. Automações e envios manuais já podem usar esse remetente."
                    : "Ainda sem chave ou remetente — nenhum e-mail é enviado até os dois campos estarem preenchidos."}
                </p>
              </div>
            </div>
          </Section>

          {/* Automação */}
          <Section
            icon={Zap}
            title="Automação"
            desc="Botão “Automatizar” no lead: manda a Abordagem pronta por WhatsApp ou e-mail, direto pelo sistema."
            className="xl:col-span-2"
          >
            <Toggle
              on={values.automation_enabled !== "no"}
              onChange={setAutomationEnabled}
              label="Automação ativa"
              hint="Desligado, o disparo pelo botão “Automatizar” do lead é bloqueado."
            />
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-1">
                <div>
                  <label className="text-[12px] font-semibold text-zinc-400">
                    Estilo padrão da mensagem
                  </label>
                  <select
                    value={values.automation_style}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, automation_style: e.target.value }))
                    }
                    className="mt-1.5 w-full rounded-xl border border-white/[0.09] bg-ink px-4 py-3 text-[13.5px] text-zinc-100 outline-none focus:border-volt/50"
                  >
                    <option value="">Aleatório (varia por lead)</option>
                    {MESSAGE_STYLES.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11.5px] text-zinc-600">
                    Mesmos estilos disponíveis na Abordagem pronta do drawer.
                  </p>
                </div>
                <Toggle
                  on={values.automation_include_about === "yes"}
                  onChange={(on) =>
                    setValues((v) => ({
                      ...v,
                      automation_include_about: on ? "yes" : "no",
                    }))
                  }
                  label="Incluir parágrafo “sobre a kreativ.ae”"
                  hint="Acrescenta um parágrafo com os diferenciais do estúdio antes do fechamento."
                />
                <PlainInput
                  label="Pausa entre partes do WhatsApp (ms)"
                  hint="Quando a mensagem sai em mais de uma bolha, esse é o intervalo entre elas."
                  value={values.automation_wa_pause_ms}
                  onChange={(v) =>
                    setValues((s) => ({ ...s, automation_wa_pause_ms: v.replace(/\D/g, "") }))
                  }
                />
              </div>

              <WaTemplateEditor
                titulo="Template do WhatsApp — Brasil"
                nome={values.automation_wa_template_br_name}
                idioma={values.automation_wa_template_br_lang}
                corpo={values.automation_wa_template_br_body}
                contaId={values.automation_wa_account_br}
                contas={waAccountsList}
                onNome={(v) => setValues((s) => ({ ...s, automation_wa_template_br_name: v }))}
                onIdioma={(v) => setValues((s) => ({ ...s, automation_wa_template_br_lang: v }))}
                onCorpo={(v) => setValues((s) => ({ ...s, automation_wa_template_br_body: v }))}
                onConta={(v) => setValues((s) => ({ ...s, automation_wa_account_br: v }))}
              />

              <WaTemplateEditor
                titulo="Template do WhatsApp — Portugal"
                nome={values.automation_wa_template_pt_name}
                idioma={values.automation_wa_template_pt_lang}
                corpo={values.automation_wa_template_pt_body}
                contaId={values.automation_wa_account_pt}
                contas={waAccountsList}
                onNome={(v) => setValues((s) => ({ ...s, automation_wa_template_pt_name: v }))}
                onIdioma={(v) => setValues((s) => ({ ...s, automation_wa_template_pt_lang: v }))}
                onCorpo={(v) => setValues((s) => ({ ...s, automation_wa_template_pt_body: v }))}
                onConta={(v) => setValues((s) => ({ ...s, automation_wa_account_pt: v }))}
              />
            </div>

            <div className="mt-4">
              <InstrucoesPanel icon={Zap} title="Como funciona">
                <ol className="list-decimal space-y-2 pl-4 text-[12.5px] leading-relaxed text-zinc-400">
                  <li>O texto sai pronto do próprio sistema — mesma Abordagem pronta do drawer, considerando se o lead tem site e o diagnóstico coletado (estilo e parágrafo “sobre” seguem o que está configurado ao lado).</li>
                  <li>WhatsApp usa a conta escolhida por idioma acima (ou detecta automaticamente pelas contas cadastradas); e-mail usa o Resend, configurado nesta página.</li>
                  <li>Sem conversa aberta, tenta o template correspondente ao idioma do lead antes de cair pra e-mail.</li>
                </ol>
                <NotaInfo>
                  Nome e idioma do template têm que bater exatamente com o que foi aprovado
                  no WhatsApp Manager, ou o envio é rejeitado pela Meta.
                </NotaInfo>
              </InstrucoesPanel>
            </div>
          </Section>

          {/* Equipe (owner only) */}
          {isOwner && (
            <Section
              icon={KeyRound}
              title="Equipe"
              desc="Usuários do sistema. Novos membros têm troca de senha obrigatória."
              className="xl:col-span-2"
            >
              <TeamSection isOwner={isOwner} />
            </Section>
          )}

          {/* Status */}
          <Section
            icon={KeyRound}
            title="Estado das integrações"
            desc="Diagnóstico rápido do que está ativo."
            className="xl:col-span-2"
          >
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <StatusChip
                label="OpenStreetMap"
                active
                detail="Sem chave — sempre disponível"
              />
              <StatusChip
                label="Google Places"
                active={!!meta.google_places_key?.set}
                detail={meta.google_places_key?.set ? `Chave ${meta.google_places_key.masked}` : "Não configurado"}
              />
              <StatusChip
                label="WhatsApp Cloud API"
                active={!!meta.wa_configured}
                detail={meta.wa_configured ? "Token + Phone ID ok" : "Aguardando configuração"}
              />
              <StatusChip
                label="Webhook assinado"
                active={!!meta.wa_app_secret?.set}
                detail={meta.wa_app_secret?.set ? "Assinatura validada" : "App Secret ausente (opcional)"}
              />
              <StatusChip
                label="E-mail (Resend)"
                active={!!meta.resend_configured}
                detail={meta.resend_configured ? "Chave + remetente ok" : "Não configurado"}
              />
              <StatusChip
                label="Claude (IA)"
                active={!!meta.anthropic_api_key?.set}
                detail={
                  meta.anthropic_api_key?.set
                    ? `Chave ${meta.anthropic_api_key.masked}`
                    : "Não configurado"
                }
              />
              <StatusChip
                label="Automação"
                active={!!meta.wa_configured || !!meta.resend_configured}
                detail={
                  meta.wa_configured && meta.resend_configured
                    ? "Pronta — WhatsApp e e-mail"
                    : meta.wa_configured
                      ? "Pronta — só WhatsApp"
                      : meta.resend_configured
                        ? "Pronta — só e-mail"
                        : "Configure WhatsApp ou e-mail acima"
                }
              />
            </div>
          </Section>

          {/* Custo */}
          <Section
            icon={Receipt}
            title="Custo das APIs"
            desc="Estimativa a partir das chamadas de fato feitas ao Google Places."
            className="xl:col-span-2"
          >
            <CustoPlacesBlock custo={meta.places_cost} />
          </Section>

          {/* Custo IA — só aparece com o toggle "Gasto real da IA" ligado, lá em cima */}
          {mostrarCustoIa && (
            <Section
              icon={Receipt}
              title="Custo da IA (Claude)"
              desc="Custo real, calculado a partir dos tokens de cada chamada e do preço oficial do modelo usado."
              className="xl:col-span-2"
            >
              <CustoAnthropicBlock
                custo={meta.anthropic_cost}
                gastoMensal={gastoAnthropic}
                gastoMensalCarregando={gastoAnthropicCarregando}
                onRecarregarGastoMensal={carregarGastoAnthropic}
              />
            </Section>
          )}

          {/* Custo Meta */}
          <Section
            icon={Receipt}
            title="Custo do WhatsApp (Meta)"
            desc="Valor real de conversas cobradas pela Meta, direto da API de analytics de cada número."
            className="xl:col-span-2"
          >
            <CustoWhatsAppBlock
              custo={waCusto}
              erro={waCustoErro}
              carregando={waCustoCarregando}
              onRecarregar={carregarCustoWhatsApp}
            />
          </Section>
        </div>
      )}
    </div>
  );
}

function CustoPlacesBlock({ custo }: { custo?: CustoPlaces }) {
  if (!custo) {
    return <p className="text-[12.5px] text-zinc-500">Carregando…</p>;
  }
  const formatUsd = (v: number) =>
    v.toLocaleString("en-US", { style: "currency", currency: "USD" });
  // O preco por requisicao tem 3 casas decimais (US$ 0,035): o formatador de
  // moeda acima arredonda para 2 e mostraria "$0.04", que nao e o preco real.
  const formatUsdPreciso = (v: number) => `$${v.toFixed(3)}`;
  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500">Google Places acumulado</p>
          <p className="font-display text-[28px] font-bold leading-tight text-white">
            {formatUsd(custo.custoUsd)}
          </p>
        </div>
        <div className="pb-1 text-[12.5px] text-zinc-400">
          <span className="font-semibold text-zinc-200 tabular-nums">
            {custo.requisicoes.toLocaleString("pt-BR")}
          </span>{" "}
          requisiç{custo.requisicoes === 1 ? "ão" : "ões"} faturáve
          {custo.requisicoes === 1 ? "l" : "is"}
          {custo.desde && <> · contando desde {formatDate(custo.desde)}</>}
        </div>
      </div>
      <p className="rounded-xl border border-white/[0.07] bg-ink/60 px-4 py-3 text-[11.5px] leading-relaxed text-zinc-500">
        Preço de {formatUsdPreciso(custo.precoPorRequisicao)} por requisição — SKU
        Enterprise do Places API (New), o nível que os campos usados aqui
        exigem (endereço completo, telefone, horários, avaliações). Cada
        página de resultado pedida à Google conta como uma requisição.{" "}
        <span className="text-zinc-400">
          É uma estimativa interna, contada a partir de quando este painel foi
          ligado — não é a fatura da Google, que fica na{" "}
          <a
            href="https://console.cloud.google.com/billing"
            target="_blank"
            rel="noreferrer"
            className="text-volt hover:underline"
          >
            Google Cloud Console
          </a>
          .
        </span>{" "}
        Buscas pelo OpenStreetMap não entram aqui: não têm custo.
      </p>
    </div>
  );
}

function CustoAnthropicBlock({
  custo,
  gastoMensal,
  gastoMensalCarregando,
  onRecarregarGastoMensal,
}: {
  custo?: CustoAnthropic;
  gastoMensal: GastoMensalAnthropic | null;
  gastoMensalCarregando: boolean;
  onRecarregarGastoMensal: () => void;
}) {
  const formatUsd = (v: number) =>
    v.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });

  const gastoMensalBlock = (
    <div className="rounded-xl border border-volt/20 bg-volt/[0.05] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500">
            Gasto real este mês (Anthropic)
          </p>
          {gastoMensalCarregando && !gastoMensal ? (
            <p className="mt-1 flex items-center gap-2 text-[13px] text-zinc-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Consultando…
            </p>
          ) : gastoMensal?.ok ? (
            <p className="font-display text-[22px] font-bold leading-tight text-white">
              {formatUsd(gastoMensal.totalUsd)}
            </p>
          ) : (
            <p className="mt-1 text-[12px] text-amber-300">
              {gastoMensal?.error ?? "Indisponível."}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onRecarregarGastoMensal}
          disabled={gastoMensalCarregando}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[11.5px] font-semibold text-zinc-300 hover:border-white/20 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${gastoMensalCarregando ? "animate-spin" : ""}`} />{" "}
          Atualizar
        </button>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
        Direto da Admin API da Anthropic (organização) — não é o mesmo cálculo do &ldquo;custo
        acumulado&rdquo; abaixo, que é uma estimativa nossa a partir dos tokens de cada chamada.
        Exige uma Admin API Key configurada acima.
      </p>
    </div>
  );

  if (!custo)
    return (
      <div className="space-y-3.5">
        {gastoMensalBlock}
        <p className="text-[12.5px] text-zinc-500">Carregando…</p>
      </div>
    );

  const totalChamadas = custo.modelos.reduce((s, m) => s + m.calls, 0);
  if (custo.modelos.length === 0) {
    return (
      <div className="space-y-3.5">
        {gastoMensalBlock}
        <p className="text-[12.5px] text-zinc-500">
          Nenhuma chamada registrada ainda — suba um print na aba IA pra começar a contar.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3.5">
      {gastoMensalBlock}
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500">
            Custo acumulado
          </p>
          <p className="font-display text-[28px] font-bold leading-tight text-white">
            {formatUsd(custo.custoUsd)}
          </p>
        </div>
        <div className="pb-1 text-[12.5px] text-zinc-400">
          <span className="font-semibold text-zinc-200 tabular-nums">
            {totalChamadas.toLocaleString("pt-BR")}
          </span>{" "}
          chamada{totalChamadas === 1 ? "" : "s"} à IA
          {custo.desde && <> · contando desde {formatDate(custo.desde)}</>}
        </div>
      </div>
      <div className="space-y-2">
        {custo.modelos.map((m) => (
          <div
            key={m.modelId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-ink/60 px-4 py-2.5"
          >
            <div className="text-[12.5px] font-semibold text-zinc-200">{m.label}</div>
            <div className="text-[11.5px] text-zinc-500">
              {m.calls.toLocaleString("pt-BR")} chamada{m.calls === 1 ? "" : "s"} ·{" "}
              {(m.noCacheInputTokens + m.cacheReadTokens + m.cacheWriteTokens).toLocaleString(
                "pt-BR",
              )}{" "}
              tok. entrada · {m.outputTokens.toLocaleString("pt-BR")} tok. saída
            </div>
            <div className="font-display text-[13.5px] font-bold text-white">
              {formatUsd(m.custoUsd)}
            </div>
          </div>
        ))}
      </div>
      <p className="rounded-xl border border-white/[0.07] bg-ink/60 px-4 py-3 text-[11.5px] leading-relaxed text-zinc-500">
        Calculado com o preço oficial por token de cada modelo, sobre os tokens reais de cada
        chamada — é o custo de verdade, não uma estimativa.{" "}
        <span className="text-zinc-400">
          Contado a partir de quando este painel foi ligado; a fatura oficial fica no{" "}
          <a
            href="https://console.anthropic.com/settings/billing"
            target="_blank"
            rel="noreferrer"
            className="text-volt hover:underline"
          >
            console da Anthropic
          </a>
          .
        </span>
      </p>
    </div>
  );
}

function CustoWhatsAppBlock({
  custo,
  erro,
  carregando,
  onRecarregar,
}: {
  custo: CustoWhatsApp | null;
  erro: string | null;
  carregando: boolean;
  onRecarregar: () => void;
}) {
  if (carregando && !custo) {
    return (
      <p className="flex items-center gap-2 text-[12.5px] text-zinc-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Consultando a Meta…
      </p>
    );
  }
  if (erro && !custo) {
    return (
      <div className="space-y-3">
        <p className="text-[12.5px] text-red-400">{erro}</p>
        <button
          type="button"
          onClick={onRecarregar}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[11.5px] font-semibold text-zinc-300 hover:border-white/20"
        >
          <RefreshCw className="h-3 w-3" /> Tentar de novo
        </button>
      </div>
    );
  }
  if (!custo) return null;

  const comErro = custo.contas.filter((c) => !c.ok);
  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500">
              Total últimos {custo.periodoDias} dias
            </p>
            <p className="font-display text-[28px] font-bold leading-tight text-white">
              {custo.totalCusto.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="pb-1 text-[12.5px] text-zinc-400">
            <span className="font-semibold text-zinc-200 tabular-nums">
              {custo.totalConversas.toLocaleString("pt-BR")}
            </span>{" "}
            conversa{custo.totalConversas === 1 ? "" : "s"} cobrada
            {custo.totalConversas === 1 ? "" : "s"} · {formatDate(custo.desde)} até{" "}
            {formatDate(custo.ate)}
          </div>
        </div>
        <button
          type="button"
          onClick={onRecarregar}
          disabled={carregando}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[11.5px] font-semibold text-zinc-300 hover:border-white/20 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${carregando ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {custo.contas.length > 1 && (
        <div className="space-y-1.5">
          {custo.contas.map((c) => (
            <div
              key={c.accountId}
              className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-ink/60 px-4 py-2.5 text-[12.5px]"
            >
              <span className="text-zinc-300">
                {c.label}
                {c.displayPhone && <span className="text-zinc-500"> · {c.displayPhone}</span>}
              </span>
              {c.ok ? (
                <span className="tabular-nums text-zinc-200">
                  {c.custo.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ·{" "}
                  {c.conversas.toLocaleString("pt-BR")} conversas
                </span>
              ) : (
                <span className="text-red-400/80">{c.erro}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {comErro.length > 0 && custo.contas.length === 1 && (
        <p className="text-[12px] text-red-400/80">{comErro[0].erro}</p>
      )}

      <p className="rounded-xl border border-white/[0.07] bg-ink/60 px-4 py-3 text-[11.5px] leading-relaxed text-zinc-500">
        Valor direto do endpoint de analytics de conversas da Meta (não é
        estimativa local) — a Meta cobra por{" "}
        <span className="text-zinc-400">conversa</span>, não por chamada de
        API, e o preço varia por categoria (marketing, utilidade, serviço) e
        país. A moeda é a configurada na sua Business Manager — confira o
        valor exato faturado em{" "}
        <a
          href="https://business.facebook.com/billing_hub"
          target="_blank"
          rel="noreferrer"
          className="text-volt hover:underline"
        >
          Billing Hub
        </a>
        . O Instagram Business Discovery (usado no enriquecimento de leads)
        não tem custo.
      </p>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  desc,
  children,
  className = "",
}: {
  icon: typeof Palette;
  title: string;
  desc: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 md:p-6 ${className}`}
    >
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-volt/25 bg-volt/[0.07]">
          <Icon className="h-4 w-4 text-volt" />
        </div>
        <div>
          <h2 className="font-display text-[15px] font-bold text-white">{title}</h2>
          <p className="text-[12px] text-zinc-500">{desc}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

interface WaAccountApi {
  id: string;
  label: string;
  phoneNumberId: string;
  wabaId: string | null;
  displayPhone: string | null;
  accessTokenMasked: string | null;
}

const FORM_VAZIO = { label: "", phoneNumberId: "", wabaId: "", accessToken: "", displayPhone: "" };

const QUALIDADE_LABEL: Record<string, { label: string; className: string }> = {
  GREEN: { label: "Qualidade alta", className: "text-emerald-400" },
  YELLOW: { label: "Qualidade média", className: "text-amber-300" },
  RED: { label: "Qualidade baixa", className: "text-rose-400" },
  UNKNOWN: { label: "Qualidade desconhecida", className: "text-zinc-500" },
};

interface SaudeConta {
  estado: "carregando" | "ok" | "erro";
  qualidade?: string | null;
  tier?: string | null;
  erro?: string;
}

/**
 * Lista de numeros de WhatsApp da empresa. Cada um tem seu proprio token e
 * Phone Number ID — o App Secret e o Verify Token continuam nos campos
 * globais acima, porque sao do WEBHOOK (um so app da Meta), nao de um
 * numero especifico.
 */
function WaAccountsManager() {
  const isOwner = useIsOwner();
  const [contas, setContas] = useState<WaAccountApi[] | null>(null);
  const [editando, setEditando] = useState<string | "novo" | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [saude, setSaude] = useState<Record<string, SaudeConta>>({});

  async function verificarSaude(id: string) {
    setSaude((s) => ({ ...s, [id]: { estado: "carregando" } }));
    const res = await fetch("/api/settings/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "wa_account", id }),
    });
    const data = (await res.json()) as {
      ok: boolean;
      error?: string;
      qualityRating?: string | null;
      messagingLimitTier?: string | null;
    };
    setSaude((s) => ({
      ...s,
      [id]: data.ok
        ? { estado: "ok", qualidade: data.qualityRating, tier: data.messagingLimitTier }
        : { estado: "erro", erro: data.error ?? "Falha ao verificar." },
    }));
  }

  const carregar = useCallback(async () => {
    const res = await fetch("/api/wa-accounts");
    const data = (await res.json()) as { accounts: WaAccountApi[] };
    setContas(data.accounts);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function abrirNovo() {
    setForm(FORM_VAZIO);
    setErro(null);
    setEditando("novo");
  }

  function abrirEdicao(c: WaAccountApi) {
    setForm({
      label: c.label,
      phoneNumberId: c.phoneNumberId,
      wabaId: c.wabaId ?? "",
      accessToken: "",
      displayPhone: c.displayPhone ?? "",
    });
    setErro(null);
    setEditando(c.id);
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const novo = editando === "novo";
      const res = await fetch(novo ? "/api/wa-accounts" : `/api/wa-accounts/${editando}`, {
        method: novo ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setErro(data.error ?? "Não foi possível salvar.");
        return;
      }
      setEditando(null);
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function remover(id: string) {
    if (!window.confirm("Remover este número? Conversas já recebidas continuam salvas, mas não será mais possível responder por ele."))
      return;
    await fetch(`/api/wa-accounts/${id}`, { method: "DELETE" });
    await carregar();
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <label className="text-[12px] font-semibold text-zinc-400">Números conectados</label>
        {editando === null && (
          <button
            type="button"
            onClick={abrirNovo}
            className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-volt hover:underline"
          >
            <Plus className="h-3 w-3" />
            Adicionar número
          </button>
        )}
      </div>

      {contas === null ? (
        <p className="text-[12px] text-zinc-600">Carregando…</p>
      ) : contas.length === 0 && editando === null ? (
        <p className="rounded-xl border border-dashed border-white/[0.12] px-4 py-3 text-[12.5px] text-zinc-500">
          Nenhum número ainda. Clique em “Adicionar número”.
        </p>
      ) : (
        <div className="space-y-2">
          {contas.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-xl border border-white/[0.09] bg-ink px-4 py-3"
            >
              <Phone className="h-4 w-4 shrink-0 text-volt" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-zinc-100">{c.label}</p>
                <p className="truncate font-mono text-[11.5px] text-zinc-500">
                  {c.displayPhone ?? c.phoneNumberId} · Token {c.accessTokenMasked}
                </p>
                {saude[c.id]?.estado === "ok" && (
                  <p className="mt-1 text-[11px] font-semibold">
                    <span
                      className={
                        QUALIDADE_LABEL[saude[c.id]?.qualidade ?? "UNKNOWN"]?.className ??
                        "text-zinc-500"
                      }
                    >
                      {QUALIDADE_LABEL[saude[c.id]?.qualidade ?? "UNKNOWN"]?.label ??
                        "Qualidade desconhecida"}
                    </span>
                    {saude[c.id]?.tier && (
                      <span className="text-zinc-600"> · Limite: {saude[c.id]?.tier}</span>
                    )}
                  </p>
                )}
                {saude[c.id]?.estado === "erro" && (
                  <p className="mt-1 text-[11px] font-semibold text-rose-400">
                    {saude[c.id]?.erro}
                  </p>
                )}
              </div>
              {isOwner && (
                <button
                  type="button"
                  onClick={() => verificarSaude(c.id)}
                  disabled={saude[c.id]?.estado === "carregando"}
                  title="Verificar qualidade da conta na Meta"
                  className="shrink-0 rounded-lg border border-white/[0.08] p-2 text-zinc-400 transition-colors hover:border-volt/40 hover:text-volt disabled:opacity-50"
                >
                  {saude[c.id]?.estado === "carregando" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => abrirEdicao(c)}
                title="Editar"
                className="shrink-0 rounded-lg border border-white/[0.08] p-2 text-zinc-400 transition-colors hover:border-volt/40 hover:text-volt"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => remover(c.id)}
                title="Remover"
                className="shrink-0 rounded-lg border border-white/[0.08] p-2 text-zinc-400 transition-colors hover:border-rose-400/40 hover:text-rose-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {editando !== null && (
        <div className="space-y-2.5 rounded-xl border border-volt/25 bg-volt/[0.04] p-4">
          <input
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="Nome (ex.: Brasil, Portugal)"
            className="w-full rounded-lg border border-white/[0.09] bg-ink px-3.5 py-2.5 text-[12.5px] text-zinc-100 outline-none focus:border-volt/50"
          />
          <input
            value={form.accessToken}
            onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))}
            placeholder={editando === "novo" ? "Access Token (Meta)" : "Access Token — deixe em branco para manter o atual"}
            className="w-full rounded-lg border border-white/[0.09] bg-ink px-3.5 py-2.5 font-mono text-[12.5px] text-zinc-100 outline-none focus:border-volt/50"
          />
          <input
            value={form.phoneNumberId}
            onChange={(e) => setForm((f) => ({ ...f, phoneNumberId: e.target.value }))}
            placeholder="Phone Number ID"
            className="w-full rounded-lg border border-white/[0.09] bg-ink px-3.5 py-2.5 font-mono text-[12.5px] text-zinc-100 outline-none focus:border-volt/50"
          />
          <div className="grid grid-cols-2 gap-2.5">
            <input
              value={form.wabaId}
              onChange={(e) => setForm((f) => ({ ...f, wabaId: e.target.value }))}
              placeholder="WABA ID (opcional)"
              className="w-full rounded-lg border border-white/[0.09] bg-ink px-3.5 py-2.5 font-mono text-[12.5px] text-zinc-100 outline-none focus:border-volt/50"
            />
            <input
              value={form.displayPhone}
              onChange={(e) => setForm((f) => ({ ...f, displayPhone: e.target.value }))}
              placeholder="+55 11 3042-0065 (opcional)"
              className="w-full rounded-lg border border-white/[0.09] bg-ink px-3.5 py-2.5 font-mono text-[12.5px] text-zinc-100 outline-none focus:border-volt/50"
            />
          </div>
          {erro && <p className="text-[12px] text-rose-300">{erro}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={salvar}
              disabled={salvando}
              className="inline-flex items-center gap-1.5 rounded-full bg-volt px-3.5 py-2 text-[12px] font-bold text-onvolt disabled:opacity-50"
            >
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Salvar
            </button>
            <button
              type="button"
              onClick={() => setEditando(null)}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] px-3.5 py-2 text-[12px] font-semibold text-zinc-400 hover:text-zinc-100"
            >
              <X className="h-3.5 w-3.5" />
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SecretInput({
  label,
  hint,
  masked,
  fromEnv,
  value,
  onChange,
  onRemove,
}: {
  label: string;
  hint: string;
  masked?: string | null;
  fromEnv?: boolean;
  value: string;
  onChange: (v: string) => void;
  onRemove: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-[12px] font-semibold text-zinc-400">{label}</label>
        {masked && !fromEnv && (
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-rose-300 hover:underline"
          >
            <Trash2 className="h-3 w-3" />
            Remover
          </button>
        )}
      </div>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          masked
            ? `Configurada (${masked})${fromEnv ? " via ambiente" : ""} — digite para substituir`
            : "Cole a chave aqui"
        }
        className="mt-1.5 w-full rounded-xl border border-white/[0.09] bg-ink px-4 py-3 font-mono text-[12.5px] text-zinc-100 outline-none placeholder:font-sans placeholder:text-zinc-600 focus:border-volt/50"
      />
      <p className="mt-1 text-[11.5px] text-zinc-600">{hint}</p>
    </div>
  );
}

function PlainInput({
  label,
  hint,
  value,
  onChange,
  fromEnv,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  fromEnv?: boolean;
}) {
  return (
    <div>
      <label className="text-[12px] font-semibold text-zinc-400">
        {label}
        {fromEnv && <span className="ml-2 text-[10.5px] font-normal text-zinc-600">(via ambiente)</span>}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-xl border border-white/[0.09] bg-ink px-4 py-3 font-mono text-[12.5px] text-zinc-100 outline-none focus:border-volt/50"
      />
      <p className="mt-1 text-[11.5px] text-zinc-600">{hint}</p>
    </div>
  );
}

function CopyRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/[0.08] bg-ink px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">
          {label}
        </div>
        <div className="truncate font-mono text-[11.5px] text-zinc-300">{value}</div>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 rounded-lg border border-white/[0.08] p-2 text-zinc-400 transition-colors hover:border-volt/40 hover:text-volt"
        aria-label={`Copiar ${label}`}
      >
        {copied ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-volt" />
        ) : (
          <ClipboardCopy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

function StatusChip({
  label,
  active,
  detail,
}: {
  label: string;
  active: boolean;
  detail: string;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3.5 ${
        active
          ? "border-volt/25 bg-volt/[0.05]"
          : "border-white/[0.07] bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center gap-2 text-[13px] font-bold text-zinc-100">
        <span
          className={`h-2 w-2 rounded-full ${active ? "bg-volt" : "bg-zinc-600"}`}
        />
        {label}
      </div>
      <div className="mt-1 text-[11.5px] text-zinc-500">{detail}</div>
    </div>
  );
}
