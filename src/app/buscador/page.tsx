"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Building2,
  Check,
  ExternalLink,
  Globe2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  SearchX,
  Star,
} from "lucide-react";
import { formatPhone } from "@/lib/phone";

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

export default function BuscadorPage() {
  const [country, setCountry] = useState<"BR" | "PT">("BR");
  const [city, setCity] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, string>>({});

  async function buscar() {
    const termo = query.trim();
    if (termo.length < 2) {
      setError("Digite ao menos 2 letras do nome.");
      return;
    }
    setLoading(true);
    setError(null);
    setCandidates(null);
    try {
      const sp = new URLSearchParams({ q: termo, country });
      if (city.trim()) sp.set("city", city.trim());
      const res = await fetch(`/api/search/manual?${sp.toString()}`);
      const data = (await res.json()) as { ok: boolean; candidates?: Candidate[]; error?: string };
      if (data.ok && data.candidates) {
        setCandidates(data.candidates);
        if (data.candidates.length === 0) setError("Nenhum resultado — tente outro nome ou cidade.");
      } else {
        setError(data.error ?? "Falha ao buscar.");
      }
    } catch {
      setError("Erro de rede ao buscar.");
    } finally {
      setLoading(false);
    }
  }

  async function adicionar(c: Candidate) {
    setAddingId(c.osmId);
    try {
      const res = await fetch("/api/search/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate: c, country }),
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
      <div>
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
          <Search className="h-3.5 w-3.5" />
          Busca unitária
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
          Buscador
        </h1>
        <p className="mt-2 max-w-2xl text-[14.5px] text-zinc-400">
          Procure uma empresa ou pessoa específica pelo nome — a ferramenta busca os dados e
          você escolhe o que adicionar aos Leads e ao CRM. Tudo que entra por aqui fica
          agrupado numa pesquisa chamada <span className="text-zinc-200">Manual</span>, pra
          sempre dar pra achar de novo.
        </p>
      </div>

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
            onClick={buscar}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-volt px-6 py-3 text-[13.5px] font-bold text-onvolt transition-transform hover:scale-[1.02] disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Buscar
          </button>
        </div>

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
            return (
              <div
                key={c.osmId}
                className="flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 md:flex-row md:items-center md:justify-between md:p-5"
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
                    {c.email && (
                      <span className="inline-flex items-center gap-1.5">
                        <Mail className="h-3 w-3 shrink-0" />
                        {c.email}
                      </span>
                    )}
                    {c.website && (
                      <a
                        href={c.website}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 hover:text-volt"
                      >
                        <Globe2 className="h-3 w-3 shrink-0" />
                        Site
                      </a>
                    )}
                  </div>
                </div>

                {leadId ? (
                  <Link
                    href={`/leads?lead=${leadId}`}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-volt/40 bg-volt/10 px-4 py-2.5 text-[12.5px] font-bold text-volt transition-colors hover:bg-volt/[0.16]"
                  >
                    {jaAdicionado ? <Check className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}
                    {jaAdicionado ? "Adicionado — ver lead" : "Já é um lead — abrir"}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => adicionar(c)}
                    disabled={addingId === c.osmId}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-volt px-4 py-2.5 text-[12.5px] font-bold text-onvolt transition-transform hover:scale-[1.03] disabled:opacity-60"
                  >
                    {addingId === c.osmId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    Adicionar aos Leads
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
