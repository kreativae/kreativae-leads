"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AtSign,
  CheckCircle2,
  ClipboardCopy,
  Database,
  Globe2,
  KeyRound,
  Loader2,
  MessageSquare,
  Palette,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
  Webhook,
} from "lucide-react";
import { ThemeSelector } from "@/components/theme";
import { TeamSection } from "@/components/team-section";

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

interface SecretMeta {
  set?: boolean;
  masked?: string | null;
  fromEnv?: boolean;
}
interface PlainMeta {
  value?: string;
  fromEnv?: boolean;
}
type SettingsMeta = Record<string, SecretMeta & PlainMeta> & {
  wa_configured?: boolean;
  ig_configured?: boolean;
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
          on ? "bg-volt" : "bg-white/[0.12]"
        }`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

const SECRET_FIELDS = [
  "google_places_key",
  "wa_access_token",
  "wa_app_secret",
  "ig_access_token",
];
const PLAIN_FIELDS = [
  "wa_phone_number_id",
  "wa_waba_id",
  "wa_verify_token",
  "data_source",
  "ig_user_id",
];

export default function ConfiguracoesPage() {
  const [meta, setMeta] = useState<SettingsMeta>({});
  const [values, setValues] = useState<Record<string, string>>({
    google_places_key: "",
    data_source: "auto",
    wa_access_token: "",
    wa_phone_number_id: "",
    wa_waba_id: "",
    wa_verify_token: "",
    wa_app_secret: "",
    ig_access_token: "",
    ig_user_id: "",
    wa_enabled: "yes",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [salvandoToken, setSalvandoToken] = useState(false);
  const [origin, setOrigin] = useState("");
  const isOwner = useIsOwner();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      const data = (await res.json()) as SettingsMeta;
      setMeta(data);
      setValues((v) => ({
        ...v,
        data_source: data.data_source?.value || "auto",
        wa_phone_number_id: data.wa_phone_number_id?.value ?? "",
        wa_waba_id: data.wa_waba_id?.value ?? "",
        wa_verify_token: data.wa_verify_token?.value ?? "",
        ig_user_id: data.ig_user_id?.value ?? "",
        wa_enabled: data.wa_enabled?.value === "no" ? "no" : "yes",
      }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    setOrigin(window.location.origin);
  }, [load]);

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

          {/* WhatsApp Cloud API */}
          <Section
            icon={MessageSquare}
            title="WhatsApp Cloud API (omnichannel)"
            desc="Conecta o número oficial da empresa para receber e responder conversas aqui dentro."
            className="xl:col-span-2"
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-4">
                <Toggle
                  on={values.wa_enabled !== "no"}
                  onChange={setWaEnabled}
                  label="Omnichannel ativo"
                  hint="Desligado, a aba Conversas some do menu e o WhatsApp fica fora do fluxo."
                />
                <SecretInput
                  label="Access Token (Meta)"
                  hint="Token permanente gerado no app da Meta for Developers."
                  masked={meta.wa_access_token?.masked}
                  fromEnv={meta.wa_access_token?.fromEnv}
                  value={values.wa_access_token}
                  onChange={(v) => setValues((s) => ({ ...s, wa_access_token: v }))}
                  onRemove={() => removeSecret("wa_access_token")}
                />
                <PlainInput
                  label="Phone Number ID"
                  hint="ID numérico do número (WhatsApp → API Setup no painel da Meta)."
                  value={values.wa_phone_number_id}
                  onChange={(v) => setValues((s) => ({ ...s, wa_phone_number_id: v }))}
                  fromEnv={meta.wa_phone_number_id?.fromEnv}
                />
                <PlainInput
                  label="WhatsApp Business Account ID (WABA)"
                  hint="Opcional, para referência e futuros recursos (templates)."
                  value={values.wa_waba_id}
                  onChange={(v) => setValues((s) => ({ ...s, wa_waba_id: v }))}
                />
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
              </div>

              <div className="rounded-xl border border-white/[0.07] bg-ink/60 p-5">
                <div className="flex items-center gap-2 text-[13px] font-bold text-zinc-100">
                  <Webhook className="h-4 w-4 text-volt" />
                  Como conectar na Meta
                </div>
                <ol className="mt-3 list-decimal space-y-2 pl-4 text-[12.5px] leading-relaxed text-zinc-400">
                  <li>Crie um app em <span className="text-zinc-200">developers.facebook.com</span> e adicione o produto <span className="text-zinc-200">WhatsApp</span>.</li>
                  <li>Em <span className="text-zinc-200">API Setup</span>, copie o token permanente e o Phone Number ID para os campos ao lado e salve.</li>
                  <li>Em <span className="text-zinc-200">Configuration → Webhook</span>, cadastre a URL abaixo com o Verify Token definido aqui:</li>
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
                  <li>Pronto: mensagens recebidas aparecem na aba <span className="text-zinc-200">Conversas</span> e são vinculadas aos leads automaticamente.</li>
                </ol>
                <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.06] px-3.5 py-2.5 text-[12px] leading-relaxed text-amber-200/80">
                  Nota da Meta: fora da janela de 24h após a última mensagem do cliente,
                  a API exige mensagens de template pré-aprovadas.
                </p>
              </div>
            </div>
          </Section>

          {/* Instagram Business Discovery */}
          <Section
            icon={AtSign}
            title="Instagram (qualificação de leads)"
            desc="Busca seguidores e bio dos perfis já descobertos no enriquecimento."
            className="xl:col-span-2"
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-ink/60 p-5">
                <div className="flex items-center gap-2 text-[13px] font-bold text-zinc-100">
                  <AtSign className="h-4 w-4 text-volt" />
                  Como funciona
                </div>
                <ol className="mt-3 list-decimal space-y-2 pl-4 text-[12.5px] leading-relaxed text-zinc-400">
                  <li>O <span className="text-zinc-200">enriquecimento</span> descobre o @perfil no site do lead.</li>
                  <li>Com as credenciais acima, o botão <span className="text-zinc-200">Buscar seguidores</span> consulta a API da Meta.</li>
                  <li>Leads com muitos seguidores <span className="text-zinc-200">e sem site</span> viram prioridade de abordagem.</li>
                </ol>
                <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.06] px-3.5 py-2.5 text-[12px] leading-relaxed text-amber-200/80">
                  Limitação da Meta: só retorna dados de contas <span className="font-semibold">Business ou Creator</span>.
                  Perfis pessoais ficam sem seguidores — e não existe busca por cidade ou
                  segmento, apenas consulta por @perfil já conhecido.
                </p>
              </div>
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
            </div>
          </Section>
        </div>
      )}
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
