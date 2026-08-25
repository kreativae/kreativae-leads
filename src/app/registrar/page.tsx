"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Check,
  Crown,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  User2,
  X,
} from "lucide-react";

export function PasswordMeter({
  password,
  onChange,
}: {
  password: string;
  onChange: (ok: boolean) => void;
}) {
  const checks = [
    { ok: password.length >= 10, label: "10+ caracteres" },
    { ok: /[a-zà-ú]/.test(password) && /[A-ZÀ-Ú]/.test(password), label: "Maiúsculas e minúsculas" },
    { ok: /\d/.test(password), label: "Número" },
    { ok: /[^A-Za-zÀ-ú0-9]/.test(password), label: "Símbolo (recomendado)" },
  ];
  const score =
    (password.length >= 10 ? 1 : 0) +
    (password.length >= 14 ? 1 : 0) +
    (checks[1].ok ? 1 : 0) +
    (/\d/.test(password) && /[^A-Za-zÀ-ú0-9]/.test(password) ? 1 : 0);
  const strong = checks[0].ok && checks[1].ok && checks[2].ok;

  useEffect(() => {
    onChange(strong);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strong]);

  return (
    <div className="mt-2.5 space-y-2">
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < score
                ? score >= 3
                  ? "bg-volt"
                  : "bg-amber-300"
                : "bg-white/[0.08]"
            }`}
          />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-1">
        {checks.map((c) => (
          <li
            key={c.label}
            className={`flex items-center gap-1.5 text-[10.5px] ${
              c.ok ? "text-emerald-300" : "text-zinc-600"
            }`}
          >
            {c.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RegisterForm() {
  const router = useRouter();
  const [canRegister, setCanRegister] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [strong, setStrong] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/register")
      .then((r) => r.json())
      .then((d: { canRegister: boolean }) => setCanRegister(d.canRegister))
      .catch(() => setCanRegister(false));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Falha ao criar conta.");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  if (canRegister === null)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-volt" />
      </div>
    );

  if (!canRegister)
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 text-center">
        <ShieldCheck className="mx-auto h-8 w-8 text-volt" />
        <h1 className="mt-4 font-display text-xl font-bold text-white">
          Conta principal já configurada
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-zinc-500">
          Por segurança, o registro está fechado. Novos membros da equipe são criados
          pelo proprietário em <span className="text-zinc-300">Configurações → Equipe</span>.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-full bg-volt px-6 py-3 text-[13.5px] font-bold text-onvolt"
        >
          Ir para o login
        </Link>
      </div>
    );

  return (
    <motion.form
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={submit}
      className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 backdrop-blur md:p-8"
    >
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-volt/25 bg-volt/[0.07]">
          <Crown className="h-5 w-5 text-volt" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-white">
            Configurar conta principal
          </h1>
          <p className="text-[12.5px] text-zinc-500">
            Primeiro usuário do sistema — terá papel de proprietário.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-[12px] font-semibold text-zinc-400">Seu nome</label>
          <div className="relative mt-1.5">
            <User2 className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Como a equipe te chama"
              className="w-full rounded-xl border border-white/[0.09] bg-ink py-3 pl-10 pr-4 text-[13.5px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-volt/50"
            />
          </div>
        </div>
        <div>
          <label className="text-[12px] font-semibold text-zinc-400">E-mail</label>
          <div className="relative mt-1.5">
            <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@kreativ.ae"
              className="w-full rounded-xl border border-white/[0.09] bg-ink py-3 pl-10 pr-4 text-[13.5px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-volt/50"
            />
          </div>
        </div>
        <div>
          <label className="text-[12px] font-semibold text-zinc-400">
            Senha forte
          </label>
          <div className="relative mt-1.5">
            <LockKeyhole className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Crie uma senha forte"
              className="w-full rounded-xl border border-white/[0.09] bg-ink py-3 pl-10 pr-4 text-[13.5px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-volt/50"
            />
          </div>
          <PasswordMeter password={password} onChange={setStrong} />
        </div>

        {error && (
          <div className="rounded-xl border border-rose-400/25 bg-rose-400/[0.08] px-4 py-3 text-[12.5px] text-rose-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !strong}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-volt py-3.5 font-display text-[14px] font-bold text-onvolt transition-transform enabled:hover:scale-[1.01] disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Criar conta segura
        </button>
        <p className="text-center text-[11.5px] leading-relaxed text-zinc-600">
          Após criar a conta, ative a verificação em 2 etapas (2FA) em Conta →
          Segurança.
        </p>
      </div>
    </motion.form>
  );
}

export default function RegisterPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />
        <div className="glow-volt absolute inset-0" />
      </div>
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="font-display text-4xl font-bold tracking-tight text-white">
            kreativ<span className="text-volt">.ae</span>
          </div>
          <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.32em] text-zinc-500">
            Radar de Leads
          </div>
        </div>
        <RegisterForm />
      </div>
    </div>
  );
}
