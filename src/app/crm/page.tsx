"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  Contact,
  Eye,
  EyeOff,
  Flame,
  Loader2,
  MessageCircle,
  Phone,
  RefreshCw,
  SquareKanban,
} from "lucide-react";
import { LEAD_STATUSES } from "@/lib/constants";
import { formatPhone } from "@/lib/phone";

interface BoardLead {
  id: string;
  companyName: string;
  segment: string;
  city: string | null;
  country: string;
  phone: string | null;
  whatsapp: string | null;
  opportunity: string;
  contactScore: number;
  status: string;
}

interface Column {
  status: string;
  total: number;
  leads: BoardLead[];
}

const CORES: Record<string, string> = {
  new: "border-zinc-500/30 text-zinc-300",
  contacted: "border-sky-400/40 text-sky-300",
  negotiating: "border-amber-300/40 text-amber-300",
  won: "border-emerald-400/40 text-emerald-300",
  lost: "border-rose-400/30 text-rose-300",
};

function rotulo(status: string): string {
  return LEAD_STATUSES.find((s) => s.key === status)?.label ?? status;
}

export default function CrmPage() {
  const [columns, setColumns] = useState<Column[] | null>(null);
  const [newTotal, setNewTotal] = useState(0);
  const [incluirNovos, setIncluirNovos] = useState(false);
  const [loading, setLoading] = useState(true);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);

  // Nao liga o spinner aqui: setState sincrono dentro de efeito dispara
  // renderizacao em cascata. Quem liga e o clique em Atualizar.
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/board?novos=${incluirNovos ? "1" : "0"}`);
      const data = (await res.json()) as { columns: Column[]; newTotal: number };
      setColumns(data.columns ?? []);
      setNewTotal(data.newTotal ?? 0);
    } finally {
      setLoading(false);
    }
  }, [incluirNovos]);

  useEffect(() => {
    load();
  }, [load]);

  /** Move otimista: o cartao pula de coluna antes da resposta do servidor. */
  async function mover(id: string, para: string) {
    setColumns((cols) => {
      if (!cols) return cols;
      let card: BoardLead | undefined;
      const semCard = cols.map((c) => {
        const achou = c.leads.find((l) => l.id === id);
        if (achou) card = achou;
        return achou
          ? { ...c, leads: c.leads.filter((l) => l.id !== id), total: c.total - 1 }
          : c;
      });
      if (!card) return cols;
      const movido = { ...card, status: para };
      return semCard.map((c) =>
        c.status === para
          ? { ...c, leads: [movido, ...c.leads], total: c.total + 1 }
          : c,
      );
    });
    try {
      await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: para }),
      });
    } catch {
      load(); // falhou: volta ao que o servidor tem
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
            <SquareKanban className="h-3.5 w-3.5" />
            CRM
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
            Funil comercial
          </h1>
          <p className="mt-2 text-[14.5px] text-zinc-400">
            Arraste os cartões entre as colunas para mudar o status.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIncluirNovos((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[12.5px] font-semibold transition-colors ${
              incluirNovos
                ? "border-volt/50 bg-volt/10 text-volt"
                : "border-white/[0.09] text-zinc-400 hover:text-zinc-100"
            }`}
          >
            {incluirNovos ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {incluirNovos ? "Ocultar novos" : `Mostrar novos (${newTotal})`}
          </button>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              load();
            }}
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.09] px-4 py-2.5 text-[12.5px] font-semibold text-zinc-300 transition-colors hover:border-volt/40 hover:text-volt"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </div>

      {columns === null ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-volt" />
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((col) => (
            <div
              key={col.status}
              onDragOver={(e) => {
                e.preventDefault();
                setAlvo(col.status);
              }}
              onDragLeave={() => setAlvo((a) => (a === col.status ? null : a))}
              onDrop={(e) => {
                e.preventDefault();
                setAlvo(null);
                if (arrastando) mover(arrastando, col.status);
                setArrastando(null);
              }}
              className={`flex w-[280px] shrink-0 flex-col rounded-2xl border bg-white/[0.02] transition-colors ${
                alvo === col.status ? "border-volt/50 bg-volt/[0.04]" : "border-white/[0.06]"
              }`}
            >
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[11.5px] font-bold ${
                    CORES[col.status] ?? "border-white/10 text-zinc-300"
                  }`}
                >
                  {rotulo(col.status)}
                </span>
                <span className="text-[12px] font-semibold tabular-nums text-zinc-500">
                  {col.total}
                </span>
              </div>

              <div className="flex-1 space-y-2.5 p-3">
                {col.leads.length === 0 ? (
                  <p className="px-1 py-6 text-center text-[12px] text-zinc-600">
                    Solte um cartão aqui
                  </p>
                ) : (
                  col.leads.map((l) => (
                    <div
                      key={l.id}
                      draggable
                      onDragStart={() => setArrastando(l.id)}
                      onDragEnd={() => setArrastando(null)}
                      className={`cursor-grab rounded-xl border border-white/[0.07] bg-ink/60 p-3 transition-opacity active:cursor-grabbing ${
                        arrastando === l.id ? "opacity-40" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-zinc-100">
                          {l.companyName}
                        </span>
                        <Link
                          href={`/leads?lead=${l.id}`}
                          title="Abrir o lead"
                          className="shrink-0 text-zinc-600 transition-colors hover:text-volt"
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                      <div className="mt-1 truncate text-[11.5px] text-zinc-500">
                        {l.segment}
                        {l.city ? ` · ${l.city}` : ""}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[10.5px] font-semibold tabular-nums text-zinc-400">
                          <Contact className="h-2.5 w-2.5" />
                          {l.contactScore}
                        </span>
                        {l.opportunity === "no_website" && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/25 px-2 py-0.5 text-[10.5px] font-semibold text-rose-300">
                            <Flame className="h-2.5 w-2.5" />
                            Sem site
                          </span>
                        )}
                        {l.whatsapp ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-300">
                            <MessageCircle className="h-2.5 w-2.5" />
                            WhatsApp
                          </span>
                        ) : l.phone ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[10.5px] text-zinc-500">
                            <Phone className="h-2.5 w-2.5" />
                            {formatPhone(l.phone, l.country)}
                          </span>
                        ) : null}
                      </div>

                      {/* No celular nao ha arrastar: o seletor faz o mesmo. */}
                      <select
                        value={l.status}
                        onChange={(e) => mover(l.id, e.target.value)}
                        aria-label="Mudar status"
                        className="mt-2.5 w-full rounded-lg border border-white/[0.09] bg-ink px-2 py-1.5 text-[11.5px] font-medium text-zinc-300 outline-none focus:border-volt/50 sm:hidden"
                      >
                        {LEAD_STATUSES.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))
                )}
                {col.total > col.leads.length && (
                  <p className="px-1 pt-1 text-center text-[11px] text-zinc-600">
                    +{col.total - col.leads.length} não exibidos
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
