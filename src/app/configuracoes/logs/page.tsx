"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Plug,
  RefreshCw,
  Trash2,
  XCircle,
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

interface DeployInfo {
  shortSha: string | null;
  message: string | null;
  ref: string | null;
  env: string;
  bootedAt: string;
}

interface DbInfo {
  ok: boolean;
  error?: string;
  latencyMs: number;
  serverTime?: string;
  sizeMb?: number;
  connections?: number;
  version?: string;
  lastRecords?: { source: string; at: string | null }[];
}

const SOURCE_LABEL: Record<string, string> = {
  search: "Busca de leads",
  instagram_lookup: "Instagram",
  whatsapp_webhook: "WhatsApp (webhook)",
  enrich_queue: "Enriquecimento",
  wa_send: "WhatsApp (envio)",
  automation: "Automação (n8n)",
};

const SECRET_LABEL: Record<string, string> = {
  google_places_key: "Google Places — chave da API",
  wa_app_secret: "WhatsApp — App Secret",
  ig_access_token: "Instagram — Access Token",
  resend_api_key: "Resend — API Key",
};

/** wa_app_secret não é usado em chamada de saída, então não tem teste. */
const TEST_KIND: Record<string, string> = {
  google_places_key: "google_places_key",
  ig_access_token: "ig_access_token",
  resend_api_key: "resend_api_key",
};

function DeployInfoCard() {
  const [info, setInfo] = useState<DeployInfo | null>(null);

  useEffect(() => {
    fetch("/api/deploy-info")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: (DeployInfo & { ok: boolean }) | null) => (d?.ok ? setInfo(d) : undefined))
      .catch(() => undefined);
  }, []);

  if (!info) return null;

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-zinc-400">
        <span className="font-semibold text-zinc-200">Deploy atual</span>
        {info.shortSha && (
          <span className="font-mono">
            {info.shortSha}
            {info.ref ? ` · ${info.ref}` : ""}
          </span>
        )}
        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide">
          {info.env}
        </span>
        <span>desde {formatDate(info.bootedAt)}</span>
      </div>
      {info.message && <p className="mt-1.5 truncate text-[12px] text-zinc-500">{info.message}</p>}
    </section>
  );
}

function DbInfoCard() {
  const [info, setInfo] = useState<DbInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/db-info")
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => setInfo({ ok: false, latencyMs: 0, error: "Erro de conexão." }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-[15px] font-bold text-white">Banco de dados (Neon)</h2>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11.5px] font-semibold text-zinc-400 hover:bg-white/[0.07] disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Testar conexão
        </button>
      </div>

      {!info ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-volt" />
        </div>
      ) : !info.ok ? (
        <div className="flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.04] px-4 py-3 text-[12.5px] text-rose-300">
          <XCircle className="h-4 w-4 shrink-0" />
          {info.error ?? "Não foi possível conectar."}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11.5px] font-bold text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Conectado
            </span>
            <span className="text-[12px] text-zinc-500">{info.latencyMs} ms de latência</span>
            {info.sizeMb != null && <span className="text-[12px] text-zinc-500">· {info.sizeMb} MB</span>}
            {info.connections != null && (
              <span className="text-[12px] text-zinc-500">· {info.connections} conexão(ões) ativa(s)</span>
            )}
          </div>
          {info.serverTime && (
            <p className="text-[11.5px] text-zinc-600">
              Horário do servidor: {formatDate(info.serverTime)}
              {info.version ? ` · ${info.version}` : ""}
            </p>
          )}
          {info.lastRecords && info.lastRecords.length > 0 && (
            <div>
              <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-zinc-500">
                Último registro por origem
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {info.lastRecords.map((r) => (
                  <div
                    key={r.source}
                    className="rounded-lg border border-white/[0.07] bg-ink/60 px-3 py-2"
                  >
                    <div className="text-[11px] text-zinc-500">{r.source}</div>
                    <div className="text-[12px] font-semibold text-zinc-200">
                      {r.at ? formatDate(r.at) : "—"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function RevealRow({
  label,
  kind,
  id,
  testKind,
}: {
  label: string;
  kind: "setting" | "wa_account";
  id: string;
  testKind?: string;
}) {
  const [value, setValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

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

  const test = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const body = kind === "setting" ? { kind: testKind, key: id } : { kind: testKind, id };
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setTestResult({
        ok: res.ok && data.ok,
        text: data.ok ? data.detail ?? "Ok." : data.error ?? "Falhou.",
      });
    } catch {
      setTestResult({ ok: false, text: "Erro de conexão." });
    } finally {
      setTesting(false);
    }
  }, [kind, id, testKind]);

  return (
    <div className="rounded-xl border border-white/[0.07] bg-ink/60 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-zinc-100">{label}</div>
          {value && (
            <div className="mt-1 truncate rounded-lg border border-white/[0.09] bg-ink px-2 py-1 font-mono text-[11.5px] text-zinc-100">
              {value}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {testKind && (
            <button
              type="button"
              onClick={test}
              disabled={testing}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-semibold text-zinc-300 transition-colors hover:bg-white/[0.08] disabled:opacity-60"
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
              Testar
            </button>
          )}
          <button
            type="button"
            onClick={reveal}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-semibold text-zinc-300 transition-colors hover:bg-white/[0.08] disabled:opacity-60"
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
      </div>
      {testResult && (
        <div
          className={`mt-2 flex items-center gap-1.5 text-[11.5px] ${
            testResult.ok ? "text-emerald-400" : "text-rose-300"
          }`}
        >
          {testResult.ok ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <XCircle className="h-3.5 w-3.5 shrink-0" />
          )}
          {testResult.text}
        </div>
      )}
    </div>
  );
}

export default function LogsSecretosPage() {
  const pathname = usePathname();
  const lastPathname = useRef(pathname);
  const [unlocked, setUnlocked] = useState(false);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"" | "ok" | "error">("");
  const [waAccounts, setWaAccounts] = useState<{ id: string; label: string }[]>([]);
  const [limpando, setLimpando] = useState(false);
  const [page, setPage] = useState(1);
  const LOGS_POR_PAGINA = 10;
  const [panelEnabled, setPanelEnabled] = useState<boolean | null>(null);
  const [easterEggEnabled, setEasterEggEnabled] = useState(true);

  useEffect(() => {
    fetch("/api/settings/debug-toggle")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { panelEnabled?: boolean; easterEggEnabled?: boolean } | null) => {
        setPanelEnabled(d?.panelEnabled ?? true);
        setEasterEggEnabled(d?.easterEggEnabled ?? true);
      })
      .catch(() => setPanelEnabled(true));
  }, []);

  // Entrar pelo FAB ou pela sequência secreta em Configurações já deixa a
  // "chave" marcada — quem cai aqui de qualquer outro jeito (URL direta,
  // favorito, aba antiga) precisa refazer a sequência nesta própria tela.
  useEffect(() => {
    if (consumeLogsUnlocked()) setUnlocked(true);
  }, []);

  // O App Router pode manter esta página viva na navegação (voltar/trocar
  // de tela e retornar não remonta o componente), então sem isto o
  // useState acima nunca reseta e a página fica destravada pro resto da
  // sessão. usePathname() força um re-render mesmo nesse caso — sempre que
  // ele muda, sabemos que saímos e (talvez) voltamos, e travamos de novo a
  // menos que a volta tenha vindo com uma chave nova (FAB/sequência).
  useEffect(() => {
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    setUnlocked(pathname === "/configuracoes/logs" && consumeLogsUnlocked());
  }, [pathname]);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (statusFilter) sp.set("status", statusFilter);
    const res = await fetch(`/api/logs?${sp.toString()}`).catch(() => null);
    const data = await res?.json().catch(() => null);
    setLogs(res?.ok && data?.ok ? data.logs : []);
    setPage(1);
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

  async function limparAntigos() {
    if (!confirm("Apagar logs com mais de 30 dias? Não dá pra desfazer.")) return;
    setLimpando(true);
    try {
      const res = await fetch("/api/logs?olderThanDays=30", { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        alert(
          data.removidos > 0
            ? `${data.removidos} registro(s) removido(s).`
            : "Nenhum log com mais de 30 dias — nada pra remover.",
        );
        load();
      } else {
        alert(`Não foi possível limpar os logs: ${data?.error ?? `HTTP ${res.status}`}.`);
      }
    } catch (err) {
      alert(`Não foi possível limpar os logs: ${err instanceof Error ? err.message : "erro de rede"}.`);
    } finally {
      setLimpando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
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
        {unlocked && (
          <button
            type="button"
            onClick={() => setUnlocked(false)}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[12.5px] font-semibold text-zinc-400 transition-colors hover:border-rose-400/40 hover:text-rose-300"
          >
            <Lock className="h-3.5 w-3.5" />
            Sair do modo debug
          </button>
        )}
      </div>

      {panelEnabled === false ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] py-24 text-center">
          <Bug className="h-8 w-8 text-zinc-700" />
          <div>
            <p className="text-[14px] font-semibold text-zinc-300">Recurso desativado</p>
            <p className="mt-1 text-[12.5px] text-zinc-500">
              O proprietário desligou o painel de debug em Conta.
            </p>
          </div>
        </div>
      ) : !unlocked ? (
        easterEggEnabled ? (
          <LogsLockGate onUnlock={() => setUnlocked(true)} />
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] py-24 text-center">
            <Lock className="h-8 w-8 text-zinc-600" />
            <div>
              <p className="text-[14px] font-semibold text-zinc-200">Acesso restrito</p>
              <p className="mt-1 text-[12.5px] text-zinc-500">
                O easter egg está desligado — entre pelo botão flutuante em Configurações.
              </p>
            </div>
          </div>
        )
      ) : (
        <>
          <DeployInfoCard />

          <DbInfoCard />

          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 md:p-6">
            <h2 className="mb-4 font-display text-[15px] font-bold text-white">Segredos</h2>
            <div className="space-y-2.5">
              {Object.entries(SECRET_LABEL).map(([key, label]) => (
                <RevealRow key={key} label={label} kind="setting" id={key} testKind={TEST_KIND[key]} />
              ))}
              {waAccounts.map((c) => (
                <RevealRow
                  key={c.id}
                  label={`WhatsApp — Access Token (${c.label})`}
                  kind="wa_account"
                  id={c.id}
                  testKind="wa_account"
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
                <button
                  type="button"
                  onClick={limparAntigos}
                  disabled={limpando}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11.5px] font-semibold text-zinc-400 transition-colors hover:border-rose-400/40 hover:text-rose-300 disabled:opacity-60"
                >
                  {limpando ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Limpar +30 dias
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
                {logs.slice((page - 1) * LOGS_POR_PAGINA, page * LOGS_POR_PAGINA).map((log) => (
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

            {logs.length > LOGS_POR_PAGINA && (
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-[11.5px] text-zinc-500">
                  Página {page} de {Math.ceil(logs.length / LOGS_POR_PAGINA)} ·{" "}
                  {logs.length} registro(s)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11.5px] font-semibold text-zinc-400 transition-colors hover:bg-white/[0.07] disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPage((p) => Math.min(Math.ceil(logs.length / LOGS_POR_PAGINA), p + 1))
                    }
                    disabled={page >= Math.ceil(logs.length / LOGS_POR_PAGINA)}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11.5px] font-semibold text-zinc-400 transition-colors hover:bg-white/[0.07] disabled:opacity-40"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
