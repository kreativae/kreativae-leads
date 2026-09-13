"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { formatDate } from "@/lib/format";
import { consumeLogsUnlocked, LogsLockGate } from "@/components/secret-debug-trigger";

interface LogRow {
  id: string;
  source: string;
  status: "ok" | "error";
  message: string;
  detail: string | null;
  leadId: string | null;
  createdAt: string;
}

const SOURCE_LABEL: Record<string, string> = {
  search: "Busca de leads",
  instagram_lookup: "Instagram",
  whatsapp_webhook: "WhatsApp (webhook)",
  enrich_queue: "Enriquecimento",
  wa_send: "WhatsApp (envio)",
};

const SECRET_LABEL: Record<string, string> = {
  google_places_key: "Google Places — chave da API",
  wa_app_secret: "WhatsApp — App Secret",
  ig_access_token: "Instagram — Access Token",
};

function RevealRow({ label, kind, id }: { label: string; kind: "setting" | "wa_account"; id: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reveal = useCallback(async () => {
    if (value) {
      setValue(null);
      return;
    }
    setLoading(true);
    try {
      const body = kind === "setting" ? { kind, key: id } : { kind, id };
      const res = await fetch("/api/settings/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setValue(res.ok && data.ok ? data.value ?? "(vazio)" : `Erro: ${data.error ?? "falha"}`);
    } catch {
      setValue("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }, [value, kind, id]);

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-ink/60 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-zinc-100">{label}</div>
        {value && (
          <div className="mt-1 truncate rounded-lg border border-white/[0.09] bg-ink px-2 py-1 font-mono text-[11.5px] text-zinc-100">
            {value}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={reveal}
        disabled={loading}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-semibold text-zinc-300 transition-colors hover:bg-white/[0.08] disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : value ? (
          <EyeOff className="h-3.5 w-3.5" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
        {value ? "Ocultar" : "Revelar"}
      </button>
    </div>
  );
}

export default function LogsSecretosPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"" | "ok" | "error">("");
  const [waAccounts, setWaAccounts] = useState<{ id: string; label: string }[]>([]);

  // Entrar pelo FAB ou pela sequência secreta em Configurações já deixa a
  // "chave" marcada — quem cai aqui de qualquer outro jeito (URL direta,
  // favorito, aba antiga) precisa refazer a sequência nesta própria tela.
  useEffect(() => {
    if (consumeLogsUnlocked()) setUnlocked(true);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (statusFilter) sp.set("status", statusFilter);
    const res = await fetch(`/api/logs?${sp.toString()}`).catch(() => null);
    const data = await res?.json().catch(() => null);
    setLogs(res?.ok && data?.ok ? data.logs : []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    if (unlocked) load();
  }, [unlocked, load]);

  useEffect(() => {
    if (!unlocked) return;
    fetch("/api/wa-accounts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { accounts: { id: string; label: string }[] } | null) =>
        setWaAccounts(d?.accounts ?? []),
      )
      .catch(() => undefined);
  }, [unlocked]);

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-volt/25 bg-volt/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-volt">
          <Bug className="h-3.5 w-3.5" />
          Painel de debug
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
          Logs &amp; segredos
        </h1>
        <p className="mt-2 max-w-2xl text-[14.5px] text-zinc-400">
          Tela escondida — só chega aqui quem acerta a sequência no ícone de bug de
          Configurações. Toda revelação de segredo fica registrada no histórico de atividade.
        </p>
      </div>

      {!unlocked ? (
        <LogsLockGate onUnlock={() => setUnlocked(true)} />
      ) : (
        <>
      <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 md:p-6">
        <h2 className="mb-4 font-display text-[15px] font-bold text-white">Segredos</h2>
        <div className="space-y-2.5">
          {Object.entries(SECRET_LABEL).map(([key, label]) => (
            <RevealRow key={key} label={label} kind="setting" id={key} />
          ))}
          {waAccounts.map((c) => (
            <RevealRow
              key={c.id}
              label={`WhatsApp — Access Token (${c.label})`}
              kind="wa_account"
              id={c.id}
            />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 md:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-[15px] font-bold text-white">
            Histórico de execuções
          </h2>
          <div className="flex items-center gap-2">
            {(["", "error", "ok"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-colors ${
                  statusFilter === s
                    ? "bg-volt text-onvolt"
                    : "border border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07]"
                }`}
              >
                {s === "" ? "Tudo" : s === "error" ? "Só erros" : "Só sucesso"}
              </button>
            ))}
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11.5px] font-semibold text-zinc-400 hover:bg-white/[0.07]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Atualizar
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-volt" />
          </div>
        ) : logs.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-zinc-500">Nenhum registro por aqui.</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className={`rounded-xl border px-4 py-3 ${
                  log.status === "error"
                    ? "border-rose-400/20 bg-rose-400/[0.04]"
                    : "border-white/[0.07] bg-ink/60"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {log.status === "error" ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400">
                        {SOURCE_LABEL[log.source] ?? log.source}
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        {formatDate(log.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] text-zinc-200">{log.message}</p>
                    {log.detail && (
                      <p className="mt-1 text-[11.5px] leading-relaxed text-zinc-500">
                        {log.detail}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
        </>
      )}
    </div>
  );
}
