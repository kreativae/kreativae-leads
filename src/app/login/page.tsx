"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { LogoKreativ } from "@/components/logo";
import {
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        needTotp?: boolean;
        challengeId?: string;
      };
      if (data.ok && data.needTotp && data.challengeId) {
        setChallengeId(data.challengeId);
        return;
      }
      if (!data.ok) throw new Error(data.error ?? "Falha no login.");
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  async function submitOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, code: code.replace(/\s+/g, "") }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Código inválido.");
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-md"
    >
      <div className="mb-8 text-center">
        <LogoKreativ className="mx-auto h-9 w-auto text-white" />
        <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-volt/25 bg-volt/[0.06] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-volt">
          <ShieldCheck className="h-3.5 w-3.5" />
          Área segura
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 backdrop-blur md:p-8">
        <AnimatePresence mode="wait">
          {!challengeId ? (
            <motion.form
              key="credentials"
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 14 }}
              onSubmit={submit}
              className="space-y-4"
            >
              <div>
                <h1 className="font-display text-xl font-bold text-white">
                  Entrar no Radar
                </h1>
                <p className="mt-1 text-[13px] text-zinc-500">
                  Acesso restrito à equipe kreativ.ae.
                </p>
              </div>
              <div>
                <label className="text-[12px] font-semibold text-zinc-400">E-mail</label>
                <div className="relative mt-1.5">
                  <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@kreativ.ae"
                    className="w-full rounded-xl border border-white/[0.09] bg-ink py-3 pl-10 pr-4 text-[13.5px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-volt/50"
                  />
                </div>
              </div>
              <div>
                <label className="text-[12px] font-semibold text-zinc-400">Senha</label>
                <div className="relative mt-1.5">
                  <LockKeyhole className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••"
                    className="w-full rounded-xl border border-white/[0.09] bg-ink py-3 pl-10 pr-4 text-[13.5px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-volt/50"
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-xl border border-rose-400/25 bg-rose-400/[0.08] px-4 py-3 text-[12.5px] text-rose-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-volt py-3.5 font-display text-[14px] font-bold text-onvolt transition-transform enabled:hover:scale-[1.01] disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Entrar
              </button>

              <Link
                href="/registrar"
                className="block text-center text-[12.5px] text-zinc-500 transition-colors hover:text-volt"
              >
                Primeiro acesso — configurar a conta principal
              </Link>
            </motion.form>
          ) : (
            <motion.form
              key="otp"
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }}
              onSubmit={submitOtp}
              className="space-y-4"
            >
              <div>
                <h1 className="font-display text-xl font-bold text-white">
                  Verificação em 2 etapas
                </h1>
                <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">
                  Abra seu aplicativo autenticador e informe o código de 6 dígitos —
                  ou use um código de recuperação.
                </p>
              </div>
              <div>
                <label className="text-[12px] font-semibold text-zinc-400">
                  Código de verificação
                </label>
                <div className="relative mt-1.5">
                  <Smartphone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                  <input
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.slice(0, 9))}
                    placeholder="000 000"
                    className="w-full rounded-xl border border-white/[0.09] bg-ink py-3.5 pl-10 pr-4 text-center font-display text-lg font-bold tracking-[0.5em] text-zinc-100 outline-none focus:border-volt/50"
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-xl border border-rose-400/25 bg-rose-400/[0.08] px-4 py-3 text-[12.5px] text-rose-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-volt py-3.5 font-display text-[14px] font-bold text-onvolt transition-transform enabled:hover:scale-[1.01] disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Verificar e entrar
              </button>
              <button
                type="button"
                onClick={() => {
                  setChallengeId(null);
                  setCode("");
                  setError(null);
                }}
                className="w-full text-center text-[12.5px] text-zinc-500 hover:text-zinc-200"
              >
                Voltar
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>

      <p className="mt-6 text-center text-[11.5px] leading-relaxed text-zinc-600">
        Sessões protegidas por cookies HttpOnly + token hash, lockout anti brute-force
        e 2FA TOTP. Todas as tentativas são auditadas.
      </p>
    </motion.div>
  );
}

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />
        <div className="glow-volt absolute inset-0" />
      </div>
      <div className="relative w-full max-w-md">
        <Suspense
          fallback={
            <div className="flex justify-center py-24">
              <Loader2 className="h-6 w-6 animate-spin text-volt" />
            </div>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
