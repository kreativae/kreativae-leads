"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { QRCodeSVG } from "qrcode.react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  CheckCircle2,
  ClipboardCopy,
  Loader2,
  LockKeyhole,
  LogOut,
  MonitorSmartphone,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  UserRound,
  XCircle,
} from "lucide-react";
import { PasswordMeter } from "@/app/registrar/page";
import { timeAgo } from "@/lib/format";

interface Me {
  id: string;
  name: string;
  email: string;
  role: string;
  totpEnabled: boolean;
  mustChangePassword: boolean;
}

interface SessionRow {
  id: string;
  userAgent: string | null;
  ip: string | null;
  lastSeenAt: string;
  createdAt: string;
  current: boolean;
}

interface ActivityRow {
  id: string;
  event: string;
  ip: string | null;
  detail: string | null;
  createdAt: string;
}

const EVENT_LABELS: Record<string, string> = {
  login_success: "Login realizado",
  login_success_totp: "Login com 2FA",
  login_success_recovery_code: "Login com código de recuperação",
  login_failed: "Tentativa de senha incorreta",
  login_failed_locked: "Conta bloqueada por tentativas",
  login_locked_attempt: "Tentativa durante bloqueio",
  login_totp_failed: "Código 2FA incorreto",
  login_totp_required: "2FA solicitado",
  logout: "Sessão encerrada",
  password_changed: "Senha alterada",
  totp_enabled: "2FA ativado",
  totp_disabled: "2FA desativado",
  sessions_revoked_others: "Outras sessões encerradas",
  session_revoked: "Sessão revogada",
  account_created_owner: "Conta criada",
  user_created: "Criou um usuário",
  user_deleted: "Removeu um usuário",
  user_password_reset: "Redefiniu senha de usuário",
  login_failed_unknown: "Login de conta inexistente",
};

function ContaInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const forced = sp.get("forcar") === "1";

  const [me, setMe] = useState<Me | null>(null);
  const [current, setCurrent] = useState("");
  const [nextPw, setNextPw] = useState("");
  const [pwOk, setPwOk] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [savingPw, setSavingPw] = useState(false);

  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpBusy, setTotpBusy] = useState(false);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [disablePw, setDisablePw] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [copiedCodes, setCopiedCodes] = useState(false);

  const [sessionRows, setSessionRows] = useState<SessionRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);

  const loadMe = useCallback(async () => {
    const res = await fetch("/api/auth/me");
    if (res.status === 401) {
      router.push("/login?next=/conta");
      return;
    }
    const data = (await res.json()) as { user: Me | null };
    setMe(data.user);
  }, [router]);

  const loadSessions = useCallback(async () => {
    const res = await fetch("/api/auth/sessions");
    if (res.ok) setSessionRows(((await res.json()) as { sessions: SessionRow[] }).sessions);
  }, []);

  const loadActivity = useCallback(async () => {
    const res = await fetch("/api/auth/activity");
    if (res.ok) setActivity(((await res.json()) as { activity: ActivityRow[] }).activity);
  }, []);

  useEffect(() => {
    loadMe();
    loadSessions();
    loadActivity();
  }, [loadMe, loadSessions, loadActivity]);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setSavingPw(true);
    setPwMsg(null);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next: nextPw }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Falha ao alterar senha.");
      setPwMsg("ok:Senha alterada! As outras sessões foram encerradas por segurança.");
      setCurrent("");
      setNextPw("");
      loadMe().then(loadSessions).then(loadActivity);
    } catch (err) {
      setPwMsg("err:" + (err instanceof Error ? err.message : "Erro."));
    } finally {
      setSavingPw(false);
    }
  }

  async function startSetup() {
    setTotpBusy(true);
    try {
      const res = await fetch("/api/auth/2fa", { method: "POST" });
      const data = (await res.json()) as { secret: string; uri: string };
      setSetup(data);
    } finally {
      setTotpBusy(false);
    }
  }

  async function confirmSetup(e: React.FormEvent) {
    e.preventDefault();
    setTotpBusy(true);
    try {
      const res = await fetch("/api/auth/2fa", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: totpCode.replace(/\s+/g, "") }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; recoveryCodes?: string[] };
      if (!data.ok) throw new Error(data.error ?? "Código inválido.");
      setRecovery(data.recoveryCodes ?? []);
      setSetup(null);
      setTotpCode("");
      loadMe();
    } catch (err) {
      setPwMsg(null);
      alert(err instanceof Error ? err.message : "Erro.");
    } finally {
      setTotpBusy(false);
    }
  }

  async function disableTotp(e: React.FormEvent) {
    e.preventDefault();
    setTotpBusy(true);
    try {
      const res = await fetch("/api/auth/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "disable",
          password: disablePw,
          code: disableCode.replace(/\s+/g, ""),
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Falha ao desativar.");
      setDisablePw("");
      setDisableCode("");
      loadMe();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro.");
    } finally {
      setTotpBusy(false);
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/auth/sessions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    loadSessions();
  }

  async function revokeOthers() {
    await fetch("/api/auth/sessions?others=1", { method: "DELETE" });
    loadSessions();
  }

  async function copyRecovery() {
    if (!recovery) return;
    await navigator.clipboard.writeText(recovery.join("\n"));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 1500);
  }

  if (!me)
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-volt" />
      </div>
    );

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
          <UserRound className="h-3.5 w-3.5" />
          Conta e segurança
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
          {me.name}
        </h1>
        <p className="mt-1.5 text-[14px] text-zinc-400">
          {me.email} ·{" "}
          <span className="font-semibold text-volt">
            {me.role === "owner" ? "Proprietário" : "Membro"}
          </span>
        </p>
      </div>

      {(forced || me.mustChangePassword) && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-300/30 bg-amber-300/[0.08] px-5 py-4">
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-300" />
          <p className="text-[13px] leading-relaxed text-amber-200/90">
            Sua senha é temporária. <strong>Defina uma nova senha abaixo</strong> para
            continuar usando o sistema com segurança.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Change password */}
        <Card icon={LockKeyhole} title="Alterar senha" desc="Encerra automaticamente suas outras sessões.">
          <form onSubmit={changePassword} className="space-y-3.5">
            <Field
              label="Senha atual"
              type="password"
              value={current}
              onChange={setCurrent}
              autoComplete="current-password"
            />
            <div>
              <Field
                label="Nova senha"
                type="password"
                value={nextPw}
                onChange={setNextPw}
                autoComplete="new-password"
              />
              <PasswordMeter password={nextPw} onChange={setPwOk} />
            </div>
            {pwMsg && (
              <div
                className={`rounded-xl border px-4 py-3 text-[12.5px] ${
                  pwMsg.startsWith("ok:")
                    ? "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300"
                    : "border-rose-400/25 bg-rose-400/[0.08] text-rose-300"
                }`}
              >
                {pwMsg.slice(4)}
              </div>
            )}
            <button
              type="submit"
              disabled={savingPw || !pwOk || !current}
              className="inline-flex items-center gap-2 rounded-full bg-volt px-5 py-2.5 text-[13px] font-bold text-onvolt transition-transform enabled:hover:scale-[1.02] disabled:opacity-50"
            >
              {savingPw && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Salvar nova senha
            </button>
          </form>
        </Card>

        {/* 2FA */}
        <Card
          icon={Smartphone}
          title="Verificação em 2 etapas (2FA)"
          desc={me.totpEnabled ? "Ativa — sua conta exige o código do celular a cada login." : "Recomendada para o proprietário da conta."}
        >
          {me.totpEnabled ? (
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3.5 py-1.5 text-[12.5px] font-bold text-emerald-300">
                <ShieldCheck className="h-4 w-4" />
                2FA ATIVADO
              </div>
              <form onSubmit={disableTotp} className="space-y-3">
                <p className="text-[12px] text-zinc-500">
                  Para desativar, confirme sua senha e um código atual do autenticador.
                </p>
                <Field label="Senha" type="password" value={disablePw} onChange={setDisablePw} autoComplete="current-password" />
                <Field label="Código 2FA" value={disableCode} onChange={setDisableCode} placeholder="000000" inputMode="numeric" />
                <button
                  type="submit"
                  disabled={totpBusy || !disablePw || !disableCode}
                  className="rounded-full border border-rose-400/30 bg-rose-400/[0.07] px-5 py-2.5 text-[12.5px] font-bold text-rose-300 transition-colors hover:bg-rose-400/15 disabled:opacity-50"
                >
                  Desativar 2FA
                </button>
              </form>
            </div>
          ) : setup ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="flex flex-col items-center gap-4 rounded-xl border border-white/[0.08] bg-white p-5 sm:flex-row sm:items-start">
                <QRCodeSVG value={setup.uri} size={150} level="M" className="shrink-0 rounded-md" />
                <div className="w-full">
                  <p className="text-[12.5px] font-semibold text-zinc-900">
                    1. Escaneie com Google Authenticator, 1Password ou similar
                  </p>
                  <p className="mt-2 text-[11.5px] text-zinc-600">Ou digite manualmente:</p>
                  <code className="mt-1 block break-all rounded-lg bg-zinc-100 px-2.5 py-1.5 font-mono text-[11px] text-zinc-800">
                    {setup.secret}
                  </code>
                </div>
              </div>
              <form onSubmit={confirmSetup} className="mt-4 space-y-3">
                <p className="text-[12.5px] font-semibold text-zinc-300">
                  2. Informe o código de 6 dígitos gerado
                </p>
                <input
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.slice(0, 6))}
                  placeholder="000000"
                  className="w-full max-w-52 rounded-xl border border-white/[0.09] bg-ink px-4 py-3 text-center font-display text-lg font-bold tracking-[0.45em] text-zinc-100 outline-none focus:border-volt/50"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={totpBusy || totpCode.length !== 6}
                    className="inline-flex items-center gap-2 rounded-full bg-volt px-5 py-2.5 text-[13px] font-bold text-onvolt disabled:opacity-50"
                  >
                    {totpBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Ativar 2FA
                  </button>
                  <button
                    type="button"
                    onClick={() => setSetup(null)}
                    className="rounded-full border border-white/15 px-5 py-2.5 text-[13px] font-semibold text-zinc-400"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </motion.div>
          ) : (
            <div className="space-y-3">
              <p className="text-[12.5px] leading-relaxed text-zinc-500">
                Cada login vai exigir, além da senha, um código temporário do seu
                celular (TOTP compatível com Google Authenticator, Authy, 1Password).
              </p>
              <button
                type="button"
                onClick={startSetup}
                disabled={totpBusy}
                className="inline-flex items-center gap-2 rounded-full border border-volt/40 bg-volt/[0.08] px-5 py-2.5 text-[13px] font-bold text-volt transition-colors hover:bg-volt/[0.15] disabled:opacity-50"
              >
                {totpBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Smartphone className="h-3.5 w-3.5" />}
                Configurar agora
              </button>
            </div>
          )}
        </Card>
      </div>

      {/* Recovery codes modal-ish */}
      <AnimatePresence>
        {recovery && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-volt/30 bg-volt/[0.05] p-6"
          >
            <h3 className="flex items-center gap-2 font-display text-[16px] font-bold text-white">
              <ShieldCheck className="h-5 w-5 text-volt" />
              Guarde seus códigos de recuperação
            </h3>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-zinc-400">
              Se perder o celular, cada código destrava sua conta <strong>uma única vez</strong>.
              Eles não serão exibidos novamente — guarde em local seguro.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {recovery.map((c) => (
                <code
                  key={c}
                  className="rounded-lg border border-white/[0.09] bg-ink px-3 py-2.5 text-center font-mono text-[12.5px] font-bold tracking-wider text-volt"
                >
                  {c}
                </code>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={copyRecovery}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[12.5px] font-semibold text-zinc-200 hover:border-volt/40 hover:text-volt"
              >
                {copiedCodes ? <CheckCircle2 className="h-4 w-4 text-volt" /> : <ClipboardCopy className="h-4 w-4" />}
                {copiedCodes ? "Copiados" : "Copiar códigos"}
              </button>
              <button
                type="button"
                onClick={() => { setRecovery(null); loadMe(); }}
                className="rounded-full bg-volt px-4 py-2 text-[12.5px] font-bold text-onvolt"
              >
                Já guardei com segurança
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Sessions */}
        <Card icon={MonitorSmartphone} title="Sessões ativas" desc="Dispositivos conectados à sua conta.">
          <ul className="space-y-2.5">
            {sessionRows.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-ink/50 px-3.5 py-3"
              >
                <MonitorSmartphone className="h-4 w-4 shrink-0 text-zinc-500" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-semibold text-zinc-200">
                    {s.userAgent?.slice(0, 70) ?? "Dispositivo desconhecido"}
                    {s.current && (
                      <span className="ml-2 rounded-full bg-volt px-2 py-0.5 text-[9.5px] font-bold text-onvolt">
                        ESTA SESSÃO
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-zinc-500">
                    {s.ip ?? "IP —"} · ativa {timeAgo(s.lastSeenAt)}
                  </div>
                </div>
                {!s.current && (
                  <button
                    type="button"
                    onClick={() => revoke(s.id)}
                    title="Revogar sessão"
                    className="rounded-lg border border-rose-400/20 p-1.5 text-rose-300 transition-colors hover:bg-rose-400/10"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {sessionRows.length > 1 && (
            <button
              type="button"
              onClick={revokeOthers}
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[12px] font-semibold text-zinc-300 hover:border-rose-400/40 hover:text-rose-300"
            >
              <LogOut className="h-3.5 w-3.5" />
              Encerrar todas as outras sessões
            </button>
          )}
        </Card>

        {/* Activity */}
        <Card icon={Activity} title="Atividade da conta" desc="Auditoria de eventos de segurança.">
          <ul className="space-y-2">
            {activity.length === 0 && (
              <li className="text-[12.5px] text-zinc-500">Nenhum evento registrado ainda.</li>
            )}
            {activity.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-lg border border-white/[0.05] bg-ink/40 px-3.5 py-2.5"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    a.event.includes("failed") || a.event.includes("locked")
                      ? "bg-rose-400"
                      : a.event.includes("success") || a.event === "login_success"
                        ? "bg-volt"
                        : "bg-zinc-500"
                  }`}
                />
                <span className="flex-1 text-[12.5px] text-zinc-300">
                  {EVENT_LABELS[a.event] ?? a.event}
                  {a.detail ? <span className="text-zinc-500"> · {a.detail}</span> : null}
                </span>
                <span className="shrink-0 text-[10.5px] text-zinc-600">
                  {timeAgo(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: typeof LockKeyhole;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 md:p-6">
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

function Field({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  inputMode,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: "numeric";
}) {
  return (
    <div>
      <label className="text-[12px] font-semibold text-zinc-400">{label}</label>
      <input
        type={type}
        required
        value={value}
        inputMode={inputMode}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-xl border border-white/[0.09] bg-ink px-4 py-2.5 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-volt/50"
      />
    </div>
  );
}

export default function ContaPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-volt" />
        </div>
      }
    >
      <ContaInner />
    </Suspense>
  );
}
