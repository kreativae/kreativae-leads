"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw, ShieldCheck, Trash2, UserPlus, UsersRound } from "lucide-react";
import { PasswordMeter } from "@/app/registrar/page";
import { timeAgo } from "@/lib/format";

interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: string;
  totpEnabled: string;
  mustChangePassword: string;
  lastLoginAt: string | null;
  createdAt: string;
}

export function TeamSection({ isOwner }: { isOwner: boolean }) {
  const [team, setTeam] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"member" | "owner">("member");
  const [pwOk, setPwOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/users");
      if (res.ok) setTeam(((await res.json()) as { users: TeamUser[] }).users);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOwner) load();
    else setLoading(false);
  }, [isOwner, load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Falha ao criar usuário.");
      setOpen(false);
      setName(""); setEmail(""); setPassword("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(u: TeamUser) {
    if (!window.confirm(`Excluir ${u.name} (${u.email})? Sessões serão encerradas imediatamente.`)) return;
    await fetch(`/api/auth/users?id=${encodeURIComponent(u.id)}`, { method: "DELETE" });
    load();
  }

  async function resetPassword(u: TeamUser) {
    const pw = window.prompt(`Defina uma senha TEMPORÁRIA forte para ${u.name} (mín. 10 caracteres, maiúsc./minúsc./número):`);
    if (!pw) return;
    const res = await fetch("/api/auth/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, password: pw }),
    });
    const data = (await res.json()) as { ok: boolean; error?: string };
    if (!data.ok) window.alert(data.error ?? "Falha.");
    else {
      window.alert("Senha temporária definida. O usuário será obrigado a trocá-la no próximo login.");
      load();
    }
  }

  if (!isOwner) return null;

  return (
    <div>
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-volt" />
      ) : (
        <>
          <ul className="space-y-2.5">
            {team.map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-ink/50 px-4 py-3"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-volt/25 bg-volt/[0.07] font-display text-[12.5px] font-bold text-volt">
                  {u.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[13px] font-bold text-zinc-100">
                    {u.name}
                    <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider ${u.role === "owner" ? "bg-volt text-onvolt" : "border border-white/15 text-zinc-400"}`}>
                      {u.role === "owner" ? "Proprietário" : "Membro"}
                    </span>
                    {u.totpEnabled === "yes" && (
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
                    )}
                    {u.mustChangePassword === "yes" && (
                      <span className="rounded-full border border-amber-300/30 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-amber-300">
                        trocar senha
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-zinc-500">
                    {u.email} ·{" "}
                    {u.lastLoginAt ? `último login ${timeAgo(u.lastLoginAt)}` : "nunca entrou"}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => resetPassword(u)}
                    title="Redefinir senha (temporária)"
                    className="rounded-lg border border-white/[0.09] p-2 text-zinc-400 transition-colors hover:border-volt/40 hover:text-volt"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(u)}
                    title="Excluir usuário"
                    className="rounded-lg border border-rose-400/20 p-2 text-rose-300 transition-colors hover:bg-rose-400/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-volt/35 bg-volt/[0.07] px-5 py-2.5 text-[12.5px] font-bold text-volt transition-colors hover:bg-volt/[0.14]"
            >
              <UserPlus className="h-4 w-4" />
              Adicionar membro da equipe
            </button>
          ) : (
            <form onSubmit={create} className="mt-4 space-y-3 rounded-xl border border-white/[0.08] bg-ink/60 p-4">
              <div className="flex items-center gap-2 text-[13px] font-bold text-zinc-100">
                <Plus className="h-4 w-4 text-volt" />
                Novo usuário — senha temporária (troca obrigatória no 1º login)
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" className="rounded-xl border border-white/[0.09] bg-ink px-4 py-2.5 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-volt/50" />
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" className="rounded-xl border border-white/[0.09] bg-ink px-4 py-2.5 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-volt/50" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha temporária forte" autoComplete="new-password" className="w-full rounded-xl border border-white/[0.09] bg-ink px-4 py-2.5 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-volt/50" />
                </div>
                <select value={role} onChange={(e) => setRole(e.target.value as "member" | "owner")} className="rounded-xl border border-white/[0.09] bg-ink px-4 py-2.5 text-[13px] text-zinc-100 outline-none focus:border-volt/50">
                  <option value="member">Membro</option>
                  <option value="owner">Proprietário</option>
                </select>
              </div>
              <PasswordMeter password={password} onChange={setPwOk} />
              {error && <p className="text-[12px] text-rose-300">{error}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={busy || !pwOk} className="rounded-full bg-volt px-5 py-2 text-[12.5px] font-bold text-onvolt disabled:opacity-50">
                  Criar usuário
                </button>
                <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-white/15 px-5 py-2 text-[12.5px] font-semibold text-zinc-400">
                  Cancelar
                </button>
              </div>
            </form>
          )}
          <p className="mt-3 flex items-center gap-2 text-[11.5px] text-zinc-600">
            <UsersRound className="h-3.5 w-3.5" />
            O registro público fica permanentemente fechado — só o proprietário cria contas.
          </p>
        </>
      )}
    </div>
  );
}
