"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  History,
  Loader2,
  MapPin,
  Plus,
  RotateCcw,
  SearchX,
  Trash2,
} from "lucide-react";
import { formatDate, timeAgo } from "@/lib/format";
import { matchSegment, roundsAvailable } from "@/lib/constants";

interface SearchRow {
  id: string;
  segment: string;
  city: string;
  state: string | null;
  country: string;
  source: string;
  status: string;
  resultsCount: number;
  newCount: number;
  withWhatsappCount: number;
  noWebsiteCount: number;
  error: string | null;
  createdAt: string;
  round: number;
  mode: string;
  lat: number | null;
  lon: number | null;
  radiusKm: number | null;
}

export default function SearchesPage() {
  const [rows, setRows] = useState<SearchRow[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [moreId, setMoreId] = useState<string | null>(null);
  const [moreMsg, setMoreMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/searches");
      const data = (await res.json()) as { searches: SearchRow[] };
      setRows(data.searches);
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Roda a proxima formulacao da mesma pesquisa. O Google devolve no maximo
   * 60 por consulta; mudar a pergunta e o unico jeito de ir alem, e o indice
   * unico por osmId cuida da deduplicacao.
   */
  async function buscarMais(s: SearchRow) {
    setMoreId(s.id);
    setMoreMsg(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segment: s.segment,
          country: s.country,
          mode: s.mode,
          round: (s.round ?? 0) + 1,
          ...(s.mode === "radius"
            ? { lat: s.lat, lon: s.lon, radiusKm: s.radiusKm }
            : { city: s.city }),
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        search?: { resultsCount: number; newCount: number };
      };
      if (!data.ok) {
        setMoreMsg(data.error ?? "Não foi possível buscar mais.");
      } else {
        const n = data.search?.newCount ?? 0;
        setMoreMsg(
          n > 0
            ? `+${n} leads novos nesta rodada.`
            : "Esta formulação não trouxe nada novo — tente outra rodada.",
        );
      }
      await load();
    } catch {
      setMoreMsg("Falha de conexão.");
    } finally {
      setMoreId(null);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Excluir esta pesquisa do histórico? Os leads capturados são mantidos."))
      return;
    setDeletingId(id);
    try {
      await fetch(`/api/searches/${id}`, { method: "DELETE" });
      setRows((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
          <History className="h-3.5 w-3.5" />
          Histórico
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
          Últimas pesquisas
        </h1>
        <p className="mt-2 text-[14.5px] text-zinc-400">
          Todas as varreduras executadas pelo radar, com o retorno de cada uma.
        </p>
      </div>

      {moreMsg && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-volt/25 bg-volt/[0.06] px-4 py-3 text-[13px] text-zinc-200">
          <span>{moreMsg}</span>
          <button
            type="button"
            onClick={() => setMoreMsg(null)}
            className="text-[12px] font-semibold text-zinc-500 hover:text-zinc-200"
          >
            Fechar
          </button>
        </div>
      )}

      {rows === null ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-volt" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-white/[0.09] px-6 py-20 text-center">
          <SearchX className="h-8 w-8 text-zinc-600" />
          <p className="max-w-sm text-[14px] text-zinc-500">
            Nenhuma pesquisa registrada. Rode a primeira varredura para começar a
            preencher o radar.
          </p>
          <Link
            href="/buscar"
            className="rounded-full bg-volt px-6 py-3 text-[13.5px] font-bold text-onvolt transition-transform hover:scale-[1.03]"
          >
            Nova busca
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <ul className="divide-y divide-white/[0.05]">
            {rows.map((s) => (
              <li key={s.id} className="p-4 md:px-6">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                  <span
                    title={s.status}
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      s.status === "done"
                        ? "bg-volt"
                        : s.status === "failed"
                          ? "bg-rose-400"
                          : "animate-pulse bg-amber-300"
                    }`}
                  />
                  <div className="min-w-0 flex-1 basis-48">
                    <div className="truncate text-[14.5px] font-semibold text-zinc-100">
                      {s.segment}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-zinc-500">
                      <MapPin className="h-3 w-3" />
                      {s.city}
                      {s.state ? ` · ${s.state}` : ""}
                      <span className="rounded border border-white/10 px-1.5 py-px text-[10px] font-bold text-zinc-400">
                        {s.country}
                      </span>
                      {s.source === "places" && (
                        <span className="rounded border border-sky-400/25 bg-sky-400/10 px-1.5 py-px text-[10px] font-bold text-sky-300">
                          GOOGLE
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Chip label={`${s.resultsCount} encontrados`} />
                    <Chip label={`${s.newCount} novos`} accent />
                    <Chip label={`${s.withWhatsappCount} WhatsApp`} />
                    <Chip label={`${s.noWebsiteCount} sem site`} danger />
                    {s.round > 0 && (
                      <span
                        title="Formulação alternativa da mesma busca"
                        className="rounded-full border border-volt/25 bg-volt/[0.07] px-2.5 py-1 text-[11px] font-bold text-volt"
                      >
                        rodada {s.round + 1}
                      </span>
                    )}
                  </div>

                  <div className="ml-auto flex items-center gap-2.5 pl-2">
                    <div className="text-right">
                      <div className="text-[12px] text-zinc-400">{timeAgo(s.createdAt)}</div>
                      <div className="text-[10.5px] text-zinc-600">
                        {formatDate(s.createdAt)}
                      </div>
                    </div>
                    {(() => {
                      const total = roundsAvailable(
                        matchSegment(s.segment).key,
                        s.segment,
                      );
                      const proxima = (s.round ?? 0) + 1;
                      const esgotou = proxima >= total;
                      return (
                        <button
                          type="button"
                          onClick={() => buscarMais(s)}
                          disabled={moreId !== null || esgotou}
                          title={
                            esgotou
                              ? "Todas as formulações desta busca já foram usadas."
                              : `Roda outra formulação (${proxima + 1}ª de ${total}) para achar leads além dos 60 do Google.`
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-[12px] font-semibold text-zinc-400 transition-colors hover:border-volt/40 hover:text-volt disabled:opacity-40"
                        >
                          {moreId === s.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                          Buscar mais
                        </button>
                      );
                    })()}
                    <Link
                      href={`/buscar?segmento=${encodeURIComponent(s.segment)}&cidade=${encodeURIComponent(s.city)}&pais=${s.country}`}
                      title="Repetir pesquisa"
                      className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2 text-zinc-400 transition-colors hover:border-volt/40 hover:text-volt"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Link>
                    <Link
                      href={`/leads?segmento=${encodeURIComponent(s.segment)}&cidade=${encodeURIComponent(
                        // searches.city guarda o rotulo da regiao ("Curitiba, PR",
                        // "Lisboa · 5 km"); leads.city guarda so o nome da cidade.
                        s.city.split(/[,·]/)[0].trim(),
                      )}`}
                      className="rounded-lg border border-volt/25 bg-volt/[0.07] px-3 py-2 text-[12px] font-semibold text-volt transition-colors hover:bg-volt/[0.14]"
                    >
                      Ver leads
                    </Link>
                    <button
                      type="button"
                      onClick={() => remove(s.id)}
                      disabled={deletingId === s.id}
                      title="Excluir pesquisa"
                      className="rounded-lg border border-rose-400/20 bg-rose-400/[0.05] p-2 text-rose-300 transition-colors hover:bg-rose-400/15 disabled:opacity-50"
                    >
                      {deletingId === s.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
                {s.status === "failed" && s.error && (
                  <p className="mt-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2 text-[12px] text-rose-300">
                    {s.error}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Chip({
  label,
  accent = false,
  danger = false,
}: {
  label: string;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums ${
        accent
          ? "border-volt/25 bg-volt/[0.07] text-volt"
          : danger
            ? "border-rose-400/25 bg-rose-400/[0.07] text-rose-300"
            : "border-white/[0.08] bg-white/[0.03] text-zinc-400"
      }`}
    >
      {label}
    </span>
  );
}
