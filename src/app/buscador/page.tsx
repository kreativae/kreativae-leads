"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Globe2,
  History,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Search,
  SearchX,
  Star,
  Stethoscope,
  X,
} from "lucide-react";
import { formatPhone } from "@/lib/phone";
import { timeAgo } from "@/lib/format";

interface Candidate {
  osmId: string;
  companyName: string;
  ownerName: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  categoryRaw: string | null;
  rating: number | null;
  reviewsCount: number | null;
  googleMapsUri: string | null;
  existingLeadId: string | null;
}

interface SiteCheck {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

interface SiteAnalysis {
  score: number;
  grade: "modern" | "outdated" | "critical";
  checks: SiteCheck[];
}

interface Edits {
  companyName: string;
  ownerName: string;
  segment: string;
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  notes: string;
}

interface HistoryEntry {
  key: string;
  query: string;
  city: string;
  country: "BR" | "PT";
  at: number;
  candidates: Candidate[];
}

const HISTORICO_KEY = "buscador_historico";
const HISTORICO_MAX = 15;

function chaveHistorico(query: string, city: string, country: string): string {
  return `${query.trim().toLowerCase()}|${city.trim().toLowerCase()}|${country}`;
}

function lerHistorico(): HistoryEntry[] {
  try {
    const bruto = localStorage.getItem(HISTORICO_KEY);
    return bruto ? (JSON.parse(bruto) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function gravarHistorico(entradas: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORICO_KEY, JSON.stringify(entradas.slice(0, HISTORICO_MAX)));
  } catch {
    /* localStorage indisponível — histórico só não persiste, sem quebrar nada */
  }
}

function edicaoVazia(c: Candidate): Edits {
  return {
    companyName: c.companyName,
    ownerName: c.ownerName ?? "",
    segment: c.categoryRaw ?? "",
    phone: c.phone ?? "",
    whatsapp: c.whatsapp ?? "",
    email: c.email ?? "",
    website: c.website ?? "",
    notes: "",
  };
}

export default function BuscadorPage() {
  const [country, setCountry] = useState<"BR" | "PT">("BR");
  const [city, setCity] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, Edits>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [analyses, setAnalyses] = useState<
    Record<string, { loading: boolean; result: SiteAnalysis | null; error: string | null }>
  >({});
  const [historico, setHistorico] = useState<HistoryEntry[]>([]);
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [servidoDoCache, setServidoDoCache] = useState<HistoryEntry | null>(null);

  useEffect(() => {
    setHistorico(lerHistorico());
  }, []);

  function edicaoDe(c: Candidate): Edits {
    return edits[c.osmId] ?? edicaoVazia(c);
  }

  function atualizarEdicao(c: Candidate, patch: Partial<Edits>) {
    setEdits((s) => ({ ...s, [c.osmId]: { ...edicaoDe(c), ...patch } }));
  }

  async function buscar(forcar = false) {
    const termo = query.trim();
    if (termo.length < 2) {
      setError("Digite ao menos 2 letras do nome.");
      return;
    }
    const chave = chaveHistorico(termo, city, country);

    if (!forcar) {
      const emCache = historico.find((h) => h.key === chave);
      if (emCache) {
        setCandidates(emCache.candidates);
        setServidoDoCache(emCache);
        setError(null);
        setEdits({});
        setAnalyses({});
        return;
      }
    }

    setLoading(true);
    setError(null);
    setCandidates(null);
    setServidoDoCache(null);
    try {
      const sp = new URLSearchParams({ q: termo, country });
      if (city.trim()) sp.set("city", city.trim());
      const res = await fetch(`/api/search/manual?${sp.toString()}`);
      const data = (await res.json()) as { ok: boolean; candidates?: Candidate[]; error?: string };
      if (data.ok && data.candidates) {
        setCandidates(data.candidates);
        setEdits({});
        setAnalyses({});
        if (data.candidates.length === 0) {
          setError("Nenhum resultado — tente outro nome ou cidade.");
        } else {
          const entrada: HistoryEntry = {
            key: chave,
            query: termo,
            city: city.trim(),
            country,
            at: Date.now(),
            candidates: data.candidates,
          };
          const novoHistorico = [entrada, ...historico.filter((h) => h.key !== chave)].slice(
            0,
            HISTORICO_MAX,
          );
          setHistorico(novoHistorico);
          gravarHistorico(novoHistorico);
        }
      } else {
        setError(data.error ?? "Falha ao buscar.");
      }
    } catch {
      setError("Erro de rede ao buscar.");
    } finally {
      setLoading(false);
    }
  }

  function reabrirHistorico(h: HistoryEntry) {
    setQuery(h.query);
    setCity(h.city);
    setCountry(h.country);
    setCandidates(h.candidates);
    setServidoDoCache(h);
    setError(null);
    setEdits({});
    setAnalyses({});
    setHistoricoAberto(false);
  }

  async function analisarSite(c: Candidate) {
    const website = edicaoDe(c).website.trim();
    if (!website) return;
    setAnalyses((s) => ({ ...s, [c.osmId]: { loading: true, result: null, error: null } }));
    try {
      const res = await fetch("/api/search/manual/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website }),
      });
      const data = (await res.json()) as { ok: boolean; analysis?: SiteAnalysis; error?: string };
      if (data.ok && data.analysis) {
        setAnalyses((s) => ({ ...s, [c.osmId]: { loading: false, result: data.analysis!, error: null } }));
      } else {
        setAnalyses((s) => ({
          ...s,
          [c.osmId]: { loading: false, result: null, error: data.error ?? "Falha ao analisar." },
        }));
      }
    } catch {
      setAnalyses((s) => ({
        ...s,
        [c.osmId]: { loading: false, result: null, error: "Erro de rede ao analisar." },
      }));
    }
  }

  async function adicionar(c: Candidate) {
    setAddingId(c.osmId);
    try {
      const e = edicaoDe(c);
      const res = await fetch("/api/search/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate: c,
          country,
          overrides: e,
          analysis: analyses[c.osmId]?.result ?? undefined,
        }),
      });
      const data = (await res.json()) as { ok: boolean; lead?: { id: string }; error?: string };
      if (data.ok && data.lead) {
        setAdded((a) => ({ ...a, [c.osmId]: data.lead!.id }));
      } else {
        setError(data.error ?? "Falha ao adicionar.");
      }
    } catch {
      setError("Erro de rede ao adicionar.");
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
            <Search className="h-3.5 w-3.5" />
            Busca unitária
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
            Buscador
          </h1>
          <p className="mt-2 max-w-2xl text-[14.5px] text-zinc-400">
            Procure uma empresa ou pessoa específica pelo nome, analise o site e personalize os
            dados antes de adicionar aos Leads e ao CRM. Tudo que entra por aqui fica agrupado
            numa pesquisa chamada <span className="text-zinc-200">Manual</span>.
          </p>
        </div>
        {historico.length > 0 && (
          <button
            type="button"
            onClick={() => setHistoricoAberto((v) => !v)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-[12.5px] font-semibold transition-colors ${
              historicoAberto
                ? "border-volt/50 bg-volt/10 text-volt"
                : "border-white/[0.09] text-zinc-400 hover:text-zinc-100"
            }`}
          >
            <History className="h-3.5 w-3.5" />
            Histórico
            <span className="rounded-full bg-white/10 px-1.5 py-px text-[10px] text-zinc-300">
              {historico.length}
            </span>
          </button>
        )}
      </div>

      {historicoAberto && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p className="mb-3 text-[11.5px] text-zinc-500">
            Reabrir usa o resultado já salvo — não gasta uma nova consulta na API.
          </p>
          <ul className="divide-y divide-white/[0.05]">
            {historico.map((h) => (
              <li key={h.key}>
                <button
                  type="button"
                  onClick={() => reabrirHistorico(h)}
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:text-volt"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-zinc-200">
                    {h.query}
                    {h.city && <span className="font-normal text-zinc-500"> · {h.city}</span>}
                  </span>
                  <span className="shrink-0 rounded border border-white/10 px-1.5 py-px text-[10px] font-bold text-zinc-500">
                    {h.country}
                  </span>
                  <span className="shrink-0 text-[11.5px] text-zinc-500">
                    {h.candidates.length} resultado(s) · {timeAgo(new Date(h.at))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 md:p-6">
        <div className="inline-flex rounded-full border border-white/[0.09] bg-ink p-1">
          {(["BR", "PT"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCountry(c)}
              className={`rounded-full px-5 py-2 text-[12.5px] font-bold transition-all ${
                country === c ? "bg-volt text-onvolt" : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              {c === "BR" ? "Brasil" : "Portugal"}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_auto]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar()}
            placeholder="Nome da empresa ou da pessoa… ex.: Estúdio Bella Arquitetura"
            className="w-full rounded-xl border border-white/[0.09] bg-ink px-4 py-3 text-[13.5px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-volt/50"
          />
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar()}
            placeholder={country === "PT" ? "Cidade (opcional)… ex.: Braga" : "Cidade (opcional)… ex.: Maringá"}
            className="w-full rounded-xl border border-white/[0.09] bg-ink px-4 py-3 text-[13.5px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-volt/50"
          />
          <button
            type="button"
            onClick={() => buscar()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-volt px-6 py-3 text-[13.5px] font-bold text-onvolt transition-transform hover:scale-[1.02] disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Buscar
          </button>
        </div>

        {servidoDoCache && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-400/25 bg-sky-400/[0.06] px-3.5 py-2.5 text-[12px] text-sky-300">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Resultado do histórico, buscado {timeAgo(new Date(servidoDoCache.at))} —
              nenhuma consulta nova foi feita à API.
            </span>
            <button
              type="button"
              onClick={() => buscar(true)}
              className="inline-flex items-center gap-1.5 font-semibold hover:underline"
            >
              <RefreshCw className="h-3 w-3" />
              Buscar de novo
            </button>
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-lg border border-rose-400/25 bg-rose-400/[0.06] px-3.5 py-2.5 text-[12.5px] text-rose-300">
            {error}
          </p>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-volt" />
        </div>
      )}

      {!loading && candidates && candidates.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/[0.09] px-6 py-16 text-center">
          <SearchX className="h-8 w-8 text-zinc-600" />
          <p className="max-w-sm text-[14px] text-zinc-500">
            Nenhum resultado pra esse nome. Tente sem a cidade, ou confira a grafia.
          </p>
        </div>
      )}

      {!loading && candidates && candidates.length > 0 && (
        <div className="space-y-3">
          {candidates.map((c) => {
            const jaAdicionado = added[c.osmId];
            const leadId = jaAdicionado ?? c.existingLeadId;
            const e = edicaoDe(c);
            const aberto = expanded[c.osmId] ?? false;
            const analise = analyses[c.osmId];

            if (leadId) {
              return (
                <div
                  key={c.osmId}
                  className="flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 md:flex-row md:items-center md:justify-between md:p-5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Building2 className="h-4 w-4 shrink-0 text-volt" />
                      <span className="font-semibold text-zinc-100">{c.companyName}</span>
                    </div>
                    {c.address && (
                      <div className="mt-1 flex items-center gap-1.5 text-[12px] text-zinc-500">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {c.address}
                      </div>
                    )}
                  </div>
                  <Link
                    href={`/leads?lead=${leadId}`}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-volt/40 bg-volt/10 px-4 py-2.5 text-[12.5px] font-bold text-volt transition-colors hover:bg-volt/[0.16]"
                  >
                    {jaAdicionado ? <Check className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}
                    {jaAdicionado ? "Adicionado — ver lead" : "Já é um lead — abrir"}
                  </Link>
                </div>
              );
            }

            return (
              <div key={c.osmId} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 md:p-5">
                <button
                  type="button"
                  onClick={() => setExpanded((s) => ({ ...s, [c.osmId]: !aberto }))}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Building2 className="h-4 w-4 shrink-0 text-volt" />
                      <span className="font-semibold text-zinc-100">{c.companyName}</span>
                      {c.categoryRaw && (
                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10.5px] font-semibold text-zinc-500">
                          {c.categoryRaw}
                        </span>
                      )}
                      {typeof c.rating === "number" && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-300">
                          <Star className="h-3 w-3 fill-current" />
                          {c.rating.toFixed(1)}
                          {c.reviewsCount ? ` (${c.reviewsCount})` : ""}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-zinc-500">
                      {c.address && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {c.address}
                        </span>
                      )}
                      {c.phone && (
                        <span className="inline-flex items-center gap-1.5">
                          <Phone className="h-3 w-3 shrink-0" />
                          {formatPhone(c.phone, country)}
                        </span>
                      )}
                    </div>
                  </div>
                  {aberto ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-zinc-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
                  )}
                </button>

                {aberto && (
                  <div className="mt-4 space-y-3 border-t border-white/[0.06] pt-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <Campo label="Nome da empresa" value={e.companyName} onChange={(v) => atualizarEdicao(c, { companyName: v })} />
                      <Campo label="Responsável" value={e.ownerName} onChange={(v) => atualizarEdicao(c, { ownerName: v })} />
                      <Campo label="Segmento" value={e.segment} onChange={(v) => atualizarEdicao(c, { segment: v })} />
                      <Campo label="Telefone" value={e.phone} onChange={(v) => atualizarEdicao(c, { phone: v })} />
                      <Campo label="WhatsApp" value={e.whatsapp} onChange={(v) => atualizarEdicao(c, { whatsapp: v })} />
                      <Campo label="E-mail" value={e.email} onChange={(v) => atualizarEdicao(c, { email: v })} />
                      <Campo label="Site" value={e.website} onChange={(v) => atualizarEdicao(c, { website: v })} className="md:col-span-2" />
                    </div>
                    <div>
                      <label className="text-[11.5px] font-semibold text-zinc-500">Anotações</label>
                      <textarea
                        value={e.notes}
                        onChange={(ev) => atualizarEdicao(c, { notes: ev.target.value })}
                        rows={2}
                        placeholder="Opcional — qualquer observação sobre o contato."
                        className="mt-1 w-full rounded-lg border border-white/[0.09] bg-ink px-3 py-2 text-[12.5px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-volt/50"
                      />
                    </div>

                    {e.website && (
                      <div>
                        <button
                          type="button"
                          onClick={() => analisarSite(c)}
                          disabled={analise?.loading}
                          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-2 text-[12px] font-semibold text-zinc-200 transition-colors hover:border-volt/40 hover:text-volt disabled:opacity-60"
                        >
                          {analise?.loading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Stethoscope className="h-3.5 w-3.5" />
                          )}
                          Analisar o site
                        </button>
                        {analise?.error && (
                          <p className="mt-2 text-[12px] text-rose-300">{analise.error}</p>
                        )}
                        {analise?.result && (
                          <div className="mt-2.5 rounded-lg border border-white/[0.07] bg-ink/60 p-3">
                            <div className="flex items-center gap-2 text-[12.5px] font-bold text-zinc-100">
                              {analise.result.grade === "modern" ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                              ) : (
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />
                              )}
                              Nota {analise.result.score}/100 —{" "}
                              {analise.result.grade === "modern"
                                ? "moderno"
                                : analise.result.grade === "outdated"
                                  ? "desatualizado"
                                  : "crítico"}
                            </div>
                            <ul className="mt-2 space-y-1.5">
                              {analise.result.checks.map((chk) => (
                                <li key={chk.id} className="flex items-start gap-2 text-[11.5px]">
                                  {chk.status === "pass" ? (
                                    <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
                                  ) : chk.status === "warn" ? (
                                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-300" />
                                  ) : (
                                    <X className="mt-0.5 h-3 w-3 shrink-0 text-rose-400" />
                                  )}
                                  <span className="text-zinc-400">
                                    <span className="font-semibold text-zinc-300">{chk.label}</span> —{" "}
                                    {chk.detail}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => adicionar(c)}
                        disabled={addingId === c.osmId}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-volt px-5 py-2.5 text-[12.5px] font-bold text-onvolt transition-transform hover:scale-[1.03] disabled:opacity-60"
                      >
                        {addingId === c.osmId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                        Adicionar aos Leads
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-[11.5px] font-semibold text-zinc-500">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-white/[0.09] bg-ink px-3 py-2 text-[12.5px] text-zinc-100 outline-none focus:border-volt/50"
      />
    </div>
  );
}
