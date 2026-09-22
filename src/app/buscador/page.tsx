"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  AtSign,
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
  Trash2,
  Wand2,
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
  instagram?: string | null;
  facebook?: string | null;
  linkedin?: string | null;
  existingLeadId: string | null;
  /** Só presente quando o candidato veio da busca por @Instagram. */
  instagramHandle?: string;
  instagramFollowers?: number | null;
  instagramMediaCount?: number | null;
  instagramBio?: string | null;
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
  instagram: string;
  facebook: string;
  linkedin: string;
  notes: string;
}

interface EnrichResult {
  emails: string[];
  phones: string[];
  whatsapps: string[];
  instagram: string | null;
  facebook: string | null;
  linkedin: string | null;
  ownerName: string | null;
  taxId: string | null;
  pagesScanned: string[];
}

type Modo = "nome" | "instagram" | "dominio";

interface DomainLookupResult {
  domain: string;
  disponivel: boolean;
  registrar?: string | null;
  criadoEm?: string | null;
  expiraEm?: string | null;
  atualizadoEm?: string | null;
  status?: string[];
  nameservers?: string[];
  proprietario?: string | null;
  organizacao?: string | null;
}

interface HistoryEntry {
  key: string;
  modo: Modo;
  query: string;
  city: string;
  country: "BR" | "PT";
  at: number;
  candidates: Candidate[];
}

const HISTORICO_MAX = 15;

interface HistoricoRow {
  chave: string;
  modo: string;
  query: string;
  city: string;
  country: string;
  candidatos: Candidate[];
  atualizadoEm: string;
}

function chaveHistorico(modo: Modo, query: string, city: string, country: string): string {
  return `${modo}|${query.trim().toLowerCase()}|${city.trim().toLowerCase()}|${country}`;
}

function linhaParaEntrada(r: HistoricoRow): HistoryEntry {
  return {
    key: r.chave,
    modo: r.modo === "instagram" ? "instagram" : "nome",
    query: r.query,
    city: r.city,
    country: r.country === "PT" ? "PT" : "BR",
    at: new Date(r.atualizadoEm).getTime(),
    candidates: r.candidatos,
  };
}

async function buscarHistorico(): Promise<HistoryEntry[]> {
  try {
    const res = await fetch("/api/search/manual/historico", { cache: "no-store" });
    const data = (await res.json()) as { ok: boolean; historico?: HistoricoRow[] };
    return data.ok && data.historico ? data.historico.map(linhaParaEntrada) : [];
  } catch {
    return [];
  }
}

function formatarDataDominio(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function InfoLinha({ label, valor }: { label: string; valor: string | null | undefined }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="text-[13px] text-zinc-200">{valor || "—"}</p>
    </div>
  );
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
    instagram: c.instagram ?? "",
    facebook: c.facebook ?? "",
    linkedin: c.linkedin ?? "",
    notes: "",
  };
}

export default function BuscadorPage() {
  const [modo, setModo] = useState<Modo>("nome");
  const [country, setCountry] = useState<"BR" | "PT">("BR");
  const [city, setCity] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [domainResult, setDomainResult] = useState<DomainLookupResult | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, Edits>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [analyses, setAnalyses] = useState<
    Record<string, { loading: boolean; result: SiteAnalysis | null; error: string | null }>
  >({});
  const [enrichments, setEnrichments] = useState<
    Record<string, { loading: boolean; result: EnrichResult | null; error: string | null }>
  >({});
  const [historico, setHistorico] = useState<HistoryEntry[]>([]);
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [servidoDoCache, setServidoDoCache] = useState<HistoryEntry | null>(null);

  useEffect(() => {
    buscarHistorico().then((entradas) => {
      setHistorico(entradas);
      // Mostra a ultima busca de cara: sem isso, a pagina abre em branco e
      // parece que nada foi salvo, mesmo com o historico cheio por tras do
      // botao "Histórico".
      if (entradas.length > 0) reabrirHistorico(entradas[0]);
    });
  }, []);

  // A aba pode ficar aberta por horas — sem isso, uma busca feita em outro
  // aparelho so aparece aqui depois de recarregar a pagina inteira.
  function alternarHistorico() {
    setHistoricoAberto((v) => {
      const abrindo = !v;
      if (abrindo) buscarHistorico().then(setHistorico);
      return abrindo;
    });
  }

  function edicaoDe(c: Candidate): Edits {
    return edits[c.osmId] ?? edicaoVazia(c);
  }

  function atualizarEdicao(c: Candidate, patch: Partial<Edits>) {
    setEdits((s) => ({ ...s, [c.osmId]: { ...edicaoDe(c), ...patch } }));
  }

  async function buscar(forcar = false) {
    const termo = query.trim();

    // Registro de domínio é um formato de resultado totalmente diferente
    // (disponibilidade + dados de registro, não uma lista de candidatos a
    // lead) — fica fora do histórico compartilhado, que só entende Candidate.
    if (modo === "dominio") {
      // Sem final nenhum digitado (nem um ponto) — completa com .com.br,
      // o mais comum por aqui, em vez de obrigar a digitar tudo.
      const dominioCompleto = termo.includes(".") ? termo : `${termo}.com.br`;
      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(dominioCompleto)) {
        setError("Digite um domínio válido — ex.: seudominio.com.br");
        return;
      }
      setQuery(dominioCompleto);
      setLoading(true);
      setError(null);
      setDomainResult(null);
      try {
        const res = await fetch(
          `/api/search/manual/domain?domain=${encodeURIComponent(dominioCompleto)}`,
        );
        const data = (await res.json()) as { ok: boolean; result?: DomainLookupResult; error?: string };
        if (data.ok && data.result) setDomainResult(data.result);
        else setError(data.error ?? "Falha ao consultar o domínio.");
      } catch {
        setError("Erro de rede ao consultar o domínio.");
      } finally {
        setLoading(false);
      }
      return;
    }

    const minimo = modo === "instagram" ? 1 : 2;
    if (termo.length < minimo) {
      setError(modo === "instagram" ? "Digite o @ do perfil." : "Digite ao menos 2 letras do nome.");
      return;
    }
    const chave = chaveHistorico(modo, termo, modo === "instagram" ? "" : city, country);

    if (!forcar) {
      const emCache = historico.find((h) => h.key === chave);
      if (emCache) {
        setCandidates(emCache.candidates);
        setServidoDoCache(emCache);
        setError(null);
        setEdits({});
        setAnalyses({});
        setEnrichments({});
        return;
      }
    }

    setLoading(true);
    setError(null);
    setCandidates(null);
    setServidoDoCache(null);
    try {
      let data: { ok: boolean; candidates?: Candidate[]; candidate?: Candidate; error?: string };
      if (modo === "instagram") {
        const sp = new URLSearchParams({ handle: termo, country });
        const res = await fetch(`/api/search/manual/instagram?${sp.toString()}`);
        data = await res.json();
        if (data.ok) data.candidates = data.candidate ? [data.candidate] : [];
      } else {
        const sp = new URLSearchParams({ q: termo, country });
        if (city.trim()) sp.set("city", city.trim());
        const res = await fetch(`/api/search/manual?${sp.toString()}`);
        data = await res.json();
      }
      if (data.ok && data.candidates) {
        setCandidates(data.candidates);
        setEdits({});
        setAnalyses({});
        setEnrichments({});
        if (data.candidates.length === 0) {
          setError(
            modo === "instagram"
              ? "Perfil não encontrado."
              : "Nenhum resultado — tente outro nome ou cidade.",
          );
        } else {
          const entrada: HistoryEntry = {
            key: chave,
            modo,
            query: termo,
            city: modo === "instagram" ? "" : city.trim(),
            country,
            at: Date.now(),
            candidates: data.candidates,
          };
          const novoHistorico = [entrada, ...historico.filter((h) => h.key !== chave)].slice(
            0,
            HISTORICO_MAX,
          );
          setHistorico(novoHistorico);
          fetch("/api/search/manual/historico", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              modo,
              query: termo,
              city: entrada.city,
              country,
              candidates: data.candidates,
            }),
          }).catch(() => {});
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
    setModo(h.modo ?? "nome");
    setQuery(h.query);
    setCity(h.city);
    setCountry(h.country);
    setCandidates(h.candidates);
    setServidoDoCache(h);
    setError(null);
    setEdits({});
    setAnalyses({});
    setEnrichments({});
    setHistoricoAberto(false);
  }

  async function removerHistorico(key: string) {
    const anterior = historico;
    setHistorico((h) => h.filter((it) => it.key !== key));
    if (servidoDoCache?.key === key) setServidoDoCache(null);
    try {
      const res = await fetch(`/api/search/manual/historico?chave=${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
    } catch {
      setHistorico(anterior);
      alert("Não foi possível remover do histórico — tente de novo.");
    }
  }

  async function limparHistoricoTudo() {
    if (!confirm("Limpar todo o histórico de buscas? Não dá pra desfazer.")) return;
    const anterior = historico;
    setHistorico([]);
    setServidoDoCache(null);
    try {
      const res = await fetch("/api/search/manual/historico?all=true", { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setHistorico(anterior);
      alert("Não foi possível limpar o histórico — tente de novo.");
    }
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

  async function enriquecer(c: Candidate) {
    const website = edicaoDe(c).website.trim();
    if (!website) return;
    setEnrichments((s) => ({ ...s, [c.osmId]: { loading: true, result: null, error: null } }));
    try {
      const res = await fetch("/api/search/manual/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website, country }),
      });
      const data = (await res.json()) as { ok: boolean; result?: EnrichResult; error?: string };
      if (data.ok && data.result) {
        const r = data.result;
        setEnrichments((s) => ({ ...s, [c.osmId]: { loading: false, result: r, error: null } }));
        // So preenche o que ainda esta vazio — nunca sobrescreve o que o
        // usuario ja tinha editado ou o que o Google ja tinha trazido.
        const atual = edicaoDe(c);
        atualizarEdicao(c, {
          ownerName: atual.ownerName || r.ownerName || "",
          email: atual.email || r.emails[0] || "",
          whatsapp: atual.whatsapp || r.whatsapps[0] || "",
          phone: atual.phone || r.phones[0] || "",
          instagram: atual.instagram || r.instagram || "",
          facebook: atual.facebook || r.facebook || "",
          linkedin: atual.linkedin || r.linkedin || "",
        });
      } else {
        setEnrichments((s) => ({
          ...s,
          [c.osmId]: { loading: false, result: null, error: data.error ?? "Falha ao enriquecer." },
        }));
      }
    } catch {
      setEnrichments((s) => ({
        ...s,
        [c.osmId]: { loading: false, result: null, error: "Erro de rede ao enriquecer." },
      }));
    }
  }

  async function adicionar(c: Candidate) {
    setAddingId(c.osmId);
    try {
      const e = edicaoDe(c);
      const enr = enrichments[c.osmId]?.result;
      const res = await fetch("/api/search/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate: c,
          country,
          overrides: e,
          analysis: analyses[c.osmId]?.result ?? undefined,
          enrichExtra: enr
            ? {
                taxId: enr.taxId,
                emailsAlt: enr.emails.slice(1),
                whatsappAlt: enr.whatsapps.slice(1),
                enrichPages: enr.pagesScanned,
              }
            : undefined,
          igProfile: c.instagramHandle
            ? {
                handle: c.instagramHandle,
                followersCount: c.instagramFollowers ?? null,
                mediaCount: c.instagramMediaCount ?? null,
                biography: c.instagramBio ?? null,
              }
            : undefined,
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
            onClick={alternarHistorico}
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
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[11.5px] text-zinc-500">
              Reabrir usa o resultado já salvo — não gasta uma nova consulta na API.
            </p>
            <button
              type="button"
              onClick={limparHistoricoTudo}
              className="inline-flex shrink-0 items-center gap-1.5 text-[11.5px] font-semibold text-zinc-500 hover:text-rose-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Limpar tudo
            </button>
          </div>
          <ul className="divide-y divide-white/[0.05]">
            {historico.map((h) => (
              <li key={h.key} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => reabrirHistorico(h)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 py-2.5 text-left hover:text-volt"
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
                <button
                  type="button"
                  onClick={() => removerHistorico(h.key)}
                  title="Remover do histórico"
                  className="shrink-0 rounded-full p-1.5 text-zinc-600 transition-colors hover:text-rose-300"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-full border border-white/[0.09] bg-ink p-1">
            {([
              { key: "nome" as const, label: "Nome / empresa" },
              { key: "instagram" as const, label: "Instagram" },
              { key: "dominio" as const, label: "Registro" },
            ]).map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => {
                  setModo(m.key);
                  setError(null);
                  setCandidates(null);
                  setDomainResult(null);
                  setServidoDoCache(null);
                }}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-bold transition-all ${
                  modo === m.key ? "bg-volt text-onvolt" : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                {m.key === "instagram" && <AtSign className="h-3.5 w-3.5" />}
                {m.key === "dominio" && <Globe2 className="h-3.5 w-3.5" />}
                {m.label}
              </button>
            ))}
          </div>

          {modo !== "dominio" && (
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
          )}
        </div>

        <div
          className={`mt-4 grid grid-cols-1 gap-3 ${
            modo === "nome" ? "md:grid-cols-[2fr_1fr_auto]" : "md:grid-cols-[1fr_auto]"
          }`}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar()}
            placeholder={
              modo === "instagram"
                ? "@ do perfil… ex.: estudiobella"
                : modo === "dominio"
                  ? "Domínio ou só o nome… ex.: seudominio (vira seudominio.com.br)"
                  : "Nome da empresa ou da pessoa… ex.: Estúdio Bella Arquitetura"
            }
            className="w-full rounded-xl border border-white/[0.09] bg-ink px-4 py-3 text-[13.5px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-volt/50"
          />
          {modo === "nome" && (
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && buscar()}
              placeholder={country === "PT" ? "Cidade (opcional)… ex.: Braga" : "Cidade (opcional)… ex.: Maringá"}
              className="w-full rounded-xl border border-white/[0.09] bg-ink px-4 py-3 text-[13.5px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-volt/50"
            />
          )}
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
        {modo === "instagram" && (
          <p className="mt-2 text-[11.5px] text-zinc-500">
            Precisa saber o @ exato — o Instagram não permite descobrir perfis por cidade ou
            categoria, só consultar um @ já conhecido.
          </p>
        )}
        {modo === "dominio" && (
          <p className="mt-2 text-[11.5px] text-zinc-500">
            Consulta o RDAP (sucessor do WHOIS) direto no registro do domínio, com o WHOIS
            clássico como reserva pra TLDs sem RDAP público (ex.: .pt). Dados do proprietário
            costumam vir ocultos por política de privacidade — isso não é falha nossa, é o
            registrador escondendo.
          </p>
        )}

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

      {!loading && modo === "dominio" && domainResult && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 md:p-6">
          {domainResult.disponivel ? (
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-7 w-7 shrink-0 text-emerald-400" />
              <div>
                <p className="text-[15px] font-bold text-emerald-300">
                  {domainResult.domain} está disponível
                </p>
                <p className="text-[12.5px] text-zinc-500">Ninguém registrou esse domínio ainda.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <SearchX className="h-7 w-7 shrink-0 text-rose-400" />
                <div>
                  <p className="text-[15px] font-bold text-rose-300">
                    {domainResult.domain} já está registrado
                  </p>
                  {domainResult.registrar && (
                    <p className="text-[12.5px] text-zinc-500">
                      Registrador: {domainResult.registrar}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 border-t border-white/[0.06] pt-4 sm:grid-cols-3">
                <InfoLinha label="Proprietário" valor={domainResult.proprietario ?? "Protegido/privado"} />
                <InfoLinha label="Organização" valor={domainResult.organizacao} />
                <InfoLinha label="Criado em" valor={formatarDataDominio(domainResult.criadoEm)} />
                <InfoLinha label="Expira em" valor={formatarDataDominio(domainResult.expiraEm)} />
                <InfoLinha label="Atualizado em" valor={formatarDataDominio(domainResult.atualizadoEm)} />
                <InfoLinha label="Status" valor={domainResult.status?.join(", ")} />
              </div>
              {!!domainResult.nameservers?.length && (
                <div className="border-t border-white/[0.06] pt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Nameservers
                  </p>
                  <p className="mt-1 text-[13px] text-zinc-200">
                    {domainResult.nameservers.join(" · ")}
                  </p>
                </div>
              )}
              {(!domainResult.proprietario || !domainResult.organizacao) && (
                <p className="border-t border-white/[0.06] pt-4 text-[11.5px] text-zinc-600">
                  Campos em branco geralmente significam que o registrador ocultou esses dados
                  por privacidade (comum em domínios .com desde a LGPD/GDPR) — não é limitação
                  da nossa consulta.
                </p>
              )}
            </div>
          )}
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
            const enriquecimento = enrichments[c.osmId];

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
                      {typeof c.instagramFollowers === "number" && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-fuchsia-400/25 bg-fuchsia-400/10 px-2 py-0.5 text-[10.5px] font-semibold text-fuchsia-300">
                          <AtSign className="h-3 w-3" />
                          {c.instagramFollowers.toLocaleString("pt-BR")} seguidores
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
                      {c.instagramHandle && (
                        <span className="inline-flex items-center gap-1.5">
                          <AtSign className="h-3 w-3 shrink-0" />@{c.instagramHandle}
                          {typeof c.instagramMediaCount === "number" && ` · ${c.instagramMediaCount} posts`}
                        </span>
                      )}
                    </div>
                    {c.instagramBio && (
                      <p className="mt-1.5 text-[11.5px] italic text-zinc-500">“{c.instagramBio}”</p>
                    )}
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
                      <Campo label="Site" value={e.website} onChange={(v) => atualizarEdicao(c, { website: v })} />
                      <Campo label="Instagram" value={e.instagram} onChange={(v) => atualizarEdicao(c, { instagram: v })} />
                      <Campo label="Facebook" value={e.facebook} onChange={(v) => atualizarEdicao(c, { facebook: v })} />
                      <Campo label="LinkedIn" value={e.linkedin} onChange={(v) => atualizarEdicao(c, { linkedin: v })} />
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
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => enriquecer(c)}
                            disabled={enriquecimento?.loading}
                            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-2 text-[12px] font-semibold text-zinc-200 transition-colors hover:border-volt/40 hover:text-volt disabled:opacity-60"
                          >
                            {enriquecimento?.loading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Wand2 className="h-3.5 w-3.5" />
                            )}
                            Enriquecer
                          </button>
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
                        </div>
                        {enriquecimento?.error && (
                          <p className="mt-2 text-[12px] text-rose-300">{enriquecimento.error}</p>
                        )}
                        {enriquecimento?.result && (
                          <p className="mt-2.5 rounded-lg border border-white/[0.07] bg-ink/60 px-3 py-2.5 text-[11.5px] text-zinc-400">
                            <Wand2 className="mr-1.5 inline h-3 w-3 text-volt" />
                            Achado em {enriquecimento.result.pagesScanned.length} página(s): {" "}
                            {[
                              enriquecimento.result.emails.length && `${enriquecimento.result.emails.length} e-mail(s)`,
                              enriquecimento.result.whatsapps.length && `${enriquecimento.result.whatsapps.length} WhatsApp`,
                              enriquecimento.result.ownerName && "nome do dono",
                              (enriquecimento.result.instagram ||
                                enriquecimento.result.facebook ||
                                enriquecimento.result.linkedin) &&
                                "redes sociais",
                            ]
                              .filter(Boolean)
                              .join(", ") || "nada de novo — preenchido acima já foi aplicado"}
                            . Os campos vazios acima foram completados automaticamente.
                          </p>
                        )}
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
