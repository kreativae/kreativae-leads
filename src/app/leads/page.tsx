"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowUpRight,
  Building2,
  AtSign,
  Clock4,
  Contact,
  Map,
  Share2,
  Sparkles,
  Star,
  Wand2,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCopy,
  ExternalLink,
  Filter,
  Flame,
  Globe,
  Link2,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  QrCode,
  RefreshCw,
  Search,
  Stethoscope,
  Trash2,
  User2,
  Users,
  X,
} from "lucide-react";
import { LEAD_STATUSES } from "@/lib/constants";
import {
  buildWhatsappMessage,
  MESSAGE_STYLES,
  waMeLink,
  type MessageStyle,
} from "@/lib/messages";
import { formatPhone, toWhatsappDigits } from "@/lib/phone";
import { timeAgo } from "@/lib/format";
import { OpportunityBadge, StatusPill, statusLabel } from "@/components/badges";
import { ScoreDial } from "@/components/charts";
import type { SiteCheck } from "@/lib/site-analyzer";

interface ClientLead {
  id: string;
  companyName: string;
  ownerName: string | null;
  segment: string;
  city: string | null;
  state: string | null;
  country: string;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  whatsappSource: string | null;
  email: string | null;
  website: string | null;
  websiteScore: number | null;
  websiteGrade: string | null;
  websiteChecks: SiteCheck[] | null;
  analyzedAt: string | null;
  opportunity: string;
  status: string;
  notes: string | null;
  createdAt: string;
  neighborhood: string | null;
  postcode: string | null;
  lat: number | null;
  lon: number | null;
  phoneAlt: string | null;
  instagram: string | null;
  igUsername: string | null;
  igFollowers: number | null;
  igMediaCount: number | null;
  igBiography: string | null;
  igCheckedAt: string | null;
  facebook: string | null;
  linkedin: string | null;
  openingHours: string | null;
  rating: number | null;
  reviewsCount: number | null;
  googleMapsUri: string | null;
  categoryRaw: string | null;
  extra: Record<string, unknown> | null;
  contactScore: number;
  enrichedAt: string | null;
}

interface LeadsResponse {
  leads: ClientLead[];
  total: number;
  withInstagram: number;
  segments: string[];
  cities: string[];
}

type BatchKind = "enrich" | "instagram";

interface BatchState {
  kind: BatchKind;
  running: boolean;
  done: number;
  total: number;
  ganhos: number;
  falhas: number;
  aviso?: string;
}

const BATCH_LABELS: Record<BatchKind, { rodando: string; fim: string; ganho: string }> = {
  enrich: {
    rodando: "Varrendo sites…",
    fim: "Enriquecimento concluído",
    ganho: "Instagram",
  },
  instagram: {
    rodando: "Consultando a Meta…",
    fim: "Consulta concluída",
    ganho: "com seguidores",
  },
};

function LeadsApp() {
  const sp = useSearchParams();
  const [data, setData] = useState<LeadsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [segment, setSegment] = useState(sp.get("segmento") ?? "");
  const [city, setCity] = useState(sp.get("cidade") ?? "");
  const [status, setStatus] = useState("");
  const [opportunity, setOpportunity] = useState(sp.get("oportunidade") ?? "");
  const [onlyWhats, setOnlyWhats] = useState(false);
  const [onlyInstagram, setOnlyInstagram] = useState(false);
  const [onlyHot, setOnlyHot] = useState(sp.get("quentes") === "1");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState<"recent" | "score" | "followers">("recent");
  // ?lead=<id> abre o lead direto — usado pelos atalhos do Radar.
  const [selectedId, setSelectedId] = useState<string | null>(sp.get("lead"));
  const [avulso, setAvulso] = useState<ClientLead | null>(null);
  const [batch, setBatch] = useState<BatchState | null>(null);
  const cancelBatch = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  // Quantos filtros estao aplicados — mostrado no botao quando o painel
  // esta fechado, para nao parecer que a lista veio incompleta sem motivo.
  const activeFilters =
    (segment ? 1 : 0) +
    (city ? 1 : 0) +
    (status ? 1 : 0) +
    (opportunity ? 1 : 0) +
    (onlyWhats ? 1 : 0) +
    (onlyHot ? 1 : 0) +
    (onlyInstagram ? 1 : 0) +
    (sort !== "recent" ? 1 : 0);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (qDebounced) params.set("q", qDebounced);
    if (segment) params.set("segment", segment);
    if (city) params.set("city", city);
    if (status) params.set("status", status);
    if (opportunity) params.set("opportunity", opportunity);
    if (onlyWhats) params.set("whatsapp", "1");
    if (onlyInstagram) params.set("instagram", "1");
    if (onlyHot) params.set("hot", "1");
    params.set("sort", sort);
    params.set("limit", "120");
    try {
      const res = await fetch(`/api/leads?${params.toString()}`);
      const json = (await res.json()) as LeadsResponse;
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [qDebounced, segment, city, status, opportunity, onlyWhats, onlyInstagram, onlyHot, sort]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const leads = useMemo(() => data?.leads ?? [], [data]);
  // O lead linkado pode nao estar na pagina atual da listagem; nesse caso
  // buscamos ele sozinho, senao o link do Radar abriria um drawer vazio.
  const naLista = leads.find((l) => l.id === selectedId) ?? null;
  const selected = naLista ?? (avulso?.id === selectedId ? avulso : null);

  useEffect(() => {
    if (!selectedId || naLista || avulso?.id === selectedId) return;
    let vivo = true;
    fetch(`/api/leads/${selectedId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { lead?: ClientLead } | null) => {
        if (vivo && d?.lead) setAvulso(d.lead);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [selectedId, naLista, avulso]);

  /**
   * Enriquecimento em lote. Roda no cliente, um lead por requisicao, com
   * concorrencia baixa: cada chamada respeita o limite de tempo da Vercel e
   * uma falha isolada nao derruba a fila inteira.
   */
  async function runBatch(kind: BatchKind) {
    if (batch?.running) return;
    const base: BatchState = {
      kind,
      running: false,
      done: 0,
      total: 0,
      ganhos: 0,
      falhas: 0,
    };
    const queueUrl =
      kind === "enrich" ? "/api/leads/enrich-queue" : "/api/leads/instagram-queue";

    let ids: string[] = [];
    try {
      const res = await fetch(queueUrl);
      if (!res.ok) throw new Error("fila");
      const data = (await res.json()) as { ids: string[]; configured?: boolean };
      if (kind === "instagram" && data.configured === false) {
        setBatch({
          ...base,
          aviso:
            "Instagram não configurado. Preencha o token e o ID da conta em Configurações.",
        });
        return;
      }
      ids = data.ids;
    } catch {
      setBatch({ ...base, falhas: 1, aviso: "Não foi possível montar a fila." });
      return;
    }
    if (ids.length === 0) {
      setBatch({
        ...base,
        aviso:
          kind === "enrich"
            ? "Nenhum lead pendente: todos os que têm site já foram varridos."
            : "Nenhum lead pendente: todos os perfis já foram consultados.",
      });
      return;
    }

    cancelBatch.current = false;
    setBatch({ ...base, running: true, total: ids.length });

    let cursor = 0;
    const CONCURRENCY = kind === "enrich" ? 3 : 2;

    async function worker() {
      while (cursor < ids.length && !cancelBatch.current) {
        const id = ids[cursor++];
        let ganhou = false;
        let falhou = false;
        try {
          const r = await fetch(
            `/api/leads/${id}/${kind === "enrich" ? "enrich" : "instagram"}`,
            { method: "POST" },
          );
          if (r.ok) {
            const data = (await r.json()) as {
              lead?: { instagram: string | null; igFollowers: number | null };
            };
            ganhou =
              kind === "enrich"
                ? !!data.lead?.instagram
                : data.lead?.igFollowers != null;
          } else {
            falhou = true;
            // Token invalido: nao adianta continuar a fila inteira.
            if (r.status === 401) cancelBatch.current = true;
          }
        } catch {
          falhou = true;
        }
        setBatch((b) =>
          b
            ? {
                ...b,
                done: b.done + 1,
                ganhos: b.ganhos + (ganhou ? 1 : 0),
                falhas: b.falhas + (falhou ? 1 : 0),
              }
            : b,
        );
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    setBatch((b) => (b ? { ...b, running: false } : b));
    fetchLeads();
  }

  function patchLocal(updated: ClientLead) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            leads: prev.leads.map((l) => (l.id === updated.id ? updated : l)),
          }
        : prev,
    );
  }

  async function updateLead(id: string, patch: { status?: string; notes?: string }) {
    const res = await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = (await res.json()) as { ok: boolean; lead?: ClientLead };
    if (json.ok && json.lead) patchLocal(json.lead);
  }

  async function deleteLead(id: string) {
    if (!window.confirm("Excluir este lead permanentemente?")) return;
    await fetch(`/api/leads/${id}`, { method: "DELETE" });
    setSelectedId(null);
    fetchLeads();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
            <Users className="h-3.5 w-3.5" />
            CRM de prospecção
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
            Leads
          </h1>
          <p className="mt-2 text-[14.5px] text-zinc-400">
            {data ? (
              <>
                <span className="font-semibold text-zinc-200 tabular-nums">
                  {data.total.toLocaleString("pt-BR")}
                </span>{" "}
                empresas no radar
                {data.withInstagram > 0 && (
                  <>
                    {" · "}
                    <span className="font-semibold text-fuchsia-300 tabular-nums">
                      {data.withInstagram.toLocaleString("pt-BR")}
                    </span>{" "}
                    com Instagram
                  </>
                )}
              </>
            ) : (
              "Carregando…"
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={fetchLeads}
          className="inline-flex items-center gap-2 rounded-full border border-white/[0.09] px-4 py-2.5 text-[12.5px] font-semibold text-zinc-300 transition-colors hover:border-volt/40 hover:text-volt"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
        <button
          type="button"
          onClick={() => runBatch("enrich")}
          disabled={batch?.running}
          className="inline-flex items-center gap-2 rounded-full border border-white/[0.09] px-4 py-2.5 text-[12.5px] font-semibold text-zinc-300 transition-colors hover:border-volt/40 hover:text-volt disabled:opacity-50"
        >
          <Wand2
            className={`h-3.5 w-3.5 ${batch?.running && batch.kind === "enrich" ? "animate-pulse" : ""}`}
          />
          {batch?.running && batch.kind === "enrich" ? "Enriquecendo…" : "Enriquecer em lote"}
        </button>
        <button
          type="button"
          onClick={() => runBatch("instagram")}
          disabled={batch?.running}
          className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/[0.07] px-4 py-2.5 text-[12.5px] font-semibold text-sky-300 transition-colors hover:border-sky-400/60 disabled:opacity-50"
        >
          <Users
            className={`h-3.5 w-3.5 ${batch?.running && batch.kind === "instagram" ? "animate-pulse" : ""}`}
          />
          {batch?.running && batch.kind === "instagram"
            ? "Consultando…"
            : "Buscar seguidores"}
        </button>
      </div>

      {/* Filter bar */}
      <div className="app-filters-sticky sticky z-30 -mx-1 rounded-2xl border border-white/[0.07] bg-ink/95 px-4 py-3.5 backdrop-blur-xl">
        <div className="sm:flex sm:flex-wrap sm:items-center sm:gap-2.5">
          {/* sm:contents dissolve este wrapper no desktop: a busca volta a ser
              item direto do flex, sem precisar duplicar o campo. */}
          <div className="flex items-center gap-2.5 sm:contents">
          <div className="relative min-w-0 flex-1 sm:min-w-52">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Empresa, responsável ou telefone…"
              className="w-full rounded-xl border border-white/[0.09] bg-ink py-2.5 pl-10 pr-4 text-[13px] text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-volt/50"
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            aria-label={filtersOpen ? "Ocultar filtros" : "Mostrar filtros"}
            className={`relative flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border transition-colors sm:hidden ${
              filtersOpen || activeFilters > 0
                ? "border-volt/50 bg-volt/10 text-volt"
                : "border-white/[0.09] text-zinc-400"
            }`}
          >
            {filtersOpen ? (
              <X className="h-4 w-4" />
            ) : (
              <Filter className="h-4 w-4" />
            )}
            {!filtersOpen && activeFilters > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-volt px-1 text-[10px] font-bold tabular-nums text-onvolt">
                {activeFilters}
              </span>
            )}
          </button>
          </div>
          <div
            className={`${
              filtersOpen ? "mt-2.5 grid" : "hidden"
            } grid-cols-2 gap-2.5 sm:mt-0 sm:contents`}
          >
          <FilterSelect
            value={segment}
            onChange={setSegment}
            placeholder="Segmento"
            options={(data?.segments ?? []).map((s) => ({ value: s, label: s }))}
          />
          <FilterSelect
            value={city}
            onChange={setCity}
            placeholder="Cidade"
            options={(data?.cities ?? []).map((c) => ({ value: c, label: c }))}
          />
          <FilterSelect
            value={opportunity}
            onChange={setOpportunity}
            placeholder="Oportunidade"
            options={[
              { value: "no_website", label: "Sem site" },
              { value: "outdated", label: "Site desatualizado" },
              { value: "unreviewed", label: "Site a analisar" },
              { value: "modern", label: "Site moderno" },
            ]}
          />
          <FilterSelect
            value={status}
            onChange={setStatus}
            placeholder="Status"
            options={LEAD_STATUSES.map((s) => ({ value: s.key, label: s.label }))}
          />
          <FilterSelect
            value={sort}
            onChange={(v) =>
              setSort(v === "score" ? "score" : v === "followers" ? "followers" : "recent")
            }
            placeholder="Ordenar"
            options={[
              { value: "recent", label: "Mais recentes" },
              { value: "score", label: "Dados mais completos" },
              { value: "followers", label: "Mais seguidores" },
            ]}
          />
          <button
            type="button"
            onClick={() => setOnlyHot((v) => !v)}
            title="Tem telefone e tem argumento: sem site, ou site reprovado na análise"
            className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2.5 text-[12.5px] font-semibold transition-all sm:justify-start ${
              onlyHot
                ? "border-rose-400/50 bg-rose-400/10 text-rose-300"
                : "border-white/[0.09] text-zinc-500 hover:text-zinc-200"
            }`}
          >
            <Flame className="h-3.5 w-3.5" />
            Leads quentes
          </button>
          <button
            type="button"
            onClick={() => setOnlyWhats((v) => !v)}
            className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2.5 text-[12.5px] font-semibold transition-all sm:justify-start ${
              onlyWhats
                ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300"
                : "border-white/[0.09] text-zinc-500 hover:text-zinc-200"
            }`}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Só WhatsApp
          </button>
          <button
            type="button"
            onClick={() => setOnlyInstagram((v) => !v)}
            className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2.5 text-[12.5px] font-semibold transition-all sm:justify-start ${
              onlyInstagram
                ? "border-fuchsia-400/50 bg-fuchsia-400/10 text-fuchsia-300"
                : "border-white/[0.09] text-zinc-500 hover:text-zinc-200"
            }`}
          >
            <AtSign className="h-3.5 w-3.5" />
            Só Instagram
          </button>
          </div>
        </div>
      </div>

      {/* Progresso do enriquecimento em lote */}
      {batch && (
        <div className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/[0.04] px-4 py-3.5">
          {batch.total === 0 ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-zinc-300">{batch.aviso}</span>
              <button
                type="button"
                onClick={() => setBatch(null)}
                className="text-[12px] font-semibold text-zinc-500 hover:text-zinc-200"
              >
                Fechar
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[13px] font-semibold text-zinc-200">
                  {batch.running
                    ? BATCH_LABELS[batch.kind].rodando
                    : BATCH_LABELS[batch.kind].fim}{" "}
                  <span className="tabular-nums text-fuchsia-300">
                    {batch.done}/{batch.total}
                  </span>
                </span>
                <div className="flex items-center gap-3 text-[12px]">
                  <span className="text-fuchsia-300 tabular-nums">
                    +{batch.ganhos} {BATCH_LABELS[batch.kind].ganho}
                  </span>
                  {batch.falhas > 0 && (
                    <span className="text-zinc-500 tabular-nums">
                      {batch.falhas} sem resposta
                    </span>
                  )}
                  {batch.running ? (
                    <button
                      type="button"
                      onClick={() => {
                        cancelBatch.current = true;
                      }}
                      className="font-semibold text-zinc-400 hover:text-rose-300"
                    >
                      Cancelar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setBatch(null)}
                      className="font-semibold text-zinc-500 hover:text-zinc-200"
                    >
                      Fechar
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-fuchsia-400 transition-all duration-300"
                  style={{ width: `${Math.round((batch.done / batch.total) * 100)}%` }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Grid */}
      {loading && !data ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-volt" />
        </div>
      ) : leads.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/[0.09] py-20 text-center">
          <Filter className="h-7 w-7 text-zinc-600" />
          <p className="max-w-md text-[13.5px] text-zinc-500">
            Nenhum lead com esses filtros. Rode uma nova busca em{" "}
            <a href="/buscar" className="text-volt hover:underline">
              Nova busca
            </a>{" "}
            ou ajuste os filtros.
          </p>
        </div>
      ) : (
        <motion.ul layout className="grid grid-cols-1 gap-3.5 md:grid-cols-2 2xl:grid-cols-3">
          <AnimatePresence>
            {leads.map((l, i) => (
              <motion.li
                key={l.id}
                layout
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.35, delay: Math.min(i * 0.025, 0.4), ease: [0.16, 1, 0.3, 1] }}
              >
                <LeadCard lead={l} onOpen={() => setSelectedId(l.id)} />
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}

      {/* Drawer */}
      <AnimatePresence>
        {selected && (
          <LeadDrawer
            key={selected.id}
            lead={selected}
            onClose={() => setSelectedId(null)}
            onUpdate={updateLead}
            onPatched={patchLocal}
            onDelete={deleteLead}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full appearance-none rounded-xl border border-white/[0.09] bg-ink py-2.5 pl-3.5 pr-9 text-[12.5px] font-medium outline-none transition-colors focus:border-volt/50 ${
          value ? "text-zinc-100" : "text-zinc-500"
        }`}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
    </div>
  );
}

/** 12.345 -> "12,3 mil"; 1.234.567 -> "1,2 mi" */
function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".", ",")} mil`;
  return String(n);
}

function LeadCard({ lead, onOpen }: { lead: ClientLead; onOpen: () => void }) {
  const phoneDisplay = formatPhone(lead.phone ?? lead.whatsapp, lead.country);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 text-left transition-all hover:border-volt/25 hover:bg-white/[0.035]"
    >
      <div className="flex items-start gap-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-ink font-display text-[15px] font-bold text-volt">
          {lead.companyName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-bold text-zinc-100">
            {lead.companyName}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-zinc-500">
            <Building2 className="h-3 w-3 shrink-0" />
            {lead.segment}
            <span className="text-zinc-700">·</span>
            <MapPin className="h-3 w-3 shrink-0" />
            {lead.city ?? lead.country}
          </div>
        </div>
        <StatusPill status={lead.status} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span
          title="Riqueza dos dados de contato"
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold tabular-nums ${
            lead.contactScore >= 60
              ? "border-volt/30 bg-volt/10 text-volt"
              : lead.contactScore >= 30
                ? "border-white/10 bg-white/[0.04] text-zinc-300"
                : "border-white/10 bg-white/[0.02] text-zinc-500"
          }`}
        >
          <Contact className="h-3 w-3" />
          {lead.contactScore}
        </span>
        <OpportunityBadge opportunity={lead.opportunity} score={lead.websiteScore} />
        {lead.rating != null && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">
            <Star className="h-3 w-3 fill-current" />
            {lead.rating.toFixed(1)}
            {lead.reviewsCount ? ` (${lead.reviewsCount})` : ""}
          </span>
        )}
        {lead.whatsapp ? (
          lead.whatsappSource === "declared" ? (
            <span
              title="Confirmado: a empresa declara este número como WhatsApp."
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300"
            >
              <CheckCircle2 className="h-3 w-3" />
              WhatsApp
            </span>
          ) : (
            <span
              title="Presumido pelo formato de celular — não confirmado pela empresa."
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-transparent px-2.5 py-0.5 text-[11px] font-medium text-emerald-300/80"
            >
              <MessageCircle className="h-3 w-3" />
              WhatsApp?
            </span>
          )
        ) : lead.phone ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-medium text-zinc-400">
            <Phone className="h-3 w-3" />
            Fixo
          </span>
        ) : (
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-[11px] text-zinc-600">
            Sem telefone
          </span>
        )}
        {lead.instagram && (
          <span
            title={lead.instagram}
            className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-400/25 bg-fuchsia-400/10 px-2.5 py-0.5 text-[11px] font-semibold text-fuchsia-300"
          >
            <AtSign className="h-3 w-3" />
            {lead.igFollowers != null
              ? `${formatFollowers(lead.igFollowers)} seguidores`
              : lead.instagram
                  .replace(/^https?:\/\/(www\.)?instagram\.com\//, "@")
                  .replace(/\/$/, "")}
          </span>
        )}
      </div>

      <div className="mt-3.5 flex items-center justify-between border-t border-white/[0.05] pt-3.5">
        <span className="truncate text-[12.5px] font-medium text-zinc-400">
          {lead.ownerName ? (
            <span className="inline-flex items-center gap-1.5">
              <User2 className="h-3 w-3 text-zinc-600" />
              {lead.ownerName}
            </span>
          ) : (
            phoneDisplay ?? "—"
          )}
        </span>
        {phoneDisplay && lead.ownerName && (
          <span className="ml-3 truncate text-[12.5px] text-zinc-500">{phoneDisplay}</span>
        )}
        {!phoneDisplay && !lead.ownerName && <span />}
        <span className="ml-auto inline-flex items-center gap-1 font-display text-[11px] font-bold uppercase tracking-wider text-zinc-600 transition-colors group-hover:text-volt">
          Abrir
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </span>
      </div>
    </button>
  );
}

function LeadDrawer({
  lead,
  onClose,
  onUpdate,
  onPatched,
  onDelete,
}: {
  lead: ClientLead;
  onClose: () => void;
  onUpdate: (id: string, patch: { status?: string; notes?: string }) => Promise<void>;
  onPatched: (lead: ClientLead) => void;
  onDelete: (id: string) => void;
}) {
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [igBusy, setIgBusy] = useState(false);
  const [igMsg, setIgMsg] = useState<string | null>(null);
  const [msgStyle, setMsgStyle] = useState<MessageStyle>("consultivo");
  const [msgVariant, setMsgVariant] = useState(0);
  const [usarDiagnostico, setUsarDiagnostico] = useState(false);
  const [incluirSobre, setIncluirSobre] = useState(false);
  // null = usar o texto gerado. Qualquer mudanca no gerador limpa a edicao,
  // senao o usuario trocaria de estilo e continuaria vendo o texto antigo.
  const [editado, setEditado] = useState<string | null>(null);

  useEffect(() => setNotes(lead.notes ?? ""), [lead.id, lead.notes]);

  const temDiagnostico = (lead.websiteChecks?.length ?? 0) > 0;
  const message = buildWhatsappMessage(lead, {
    style: msgStyle,
    variant: msgVariant,
    useAnalysis: usarDiagnostico && temDiagnostico,
    includeAbout: incluirSobre,
  });
  const mensagemFinal = editado ?? message;
  const waLink = waMeLink(lead.whatsapp, mensagemFinal);
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${lead.companyName} ${lead.address ?? ""} ${lead.city ?? ""}`,
  )}`;
  const phoneDisplay = formatPhone(lead.phone, lead.country);
  const whatsDisplay = formatPhone(lead.whatsapp, lead.country);
  const checks = lead.websiteChecks ?? [];

  async function analyze() {
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/analyze`, { method: "POST" });
      const json = (await res.json()) as { ok: boolean; lead?: ClientLead; error?: string };
      if (json.ok && json.lead) onPatched(json.lead);
      else if (json.error) window.alert(json.error);
    } finally {
      setAnalyzing(false);
    }
  }

  async function enrich() {
    setEnriching(true);
    setEnrichMsg(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}/enrich`, { method: "POST" });
      const json = (await res.json()) as {
        ok: boolean;
        lead?: ClientLead;
        error?: string;
        result?: {
          emails: string[];
          whatsapps: string[];
          ownerName: string | null;
          taxId: string | null;
          pagesScanned: string[];
        };
      };
      if (json.ok && json.lead) {
        onPatched(json.lead);
        const r = json.result;
        const bits: string[] = [];
        if (r?.emails.length) bits.push(`${r.emails.length} e-mail(s)`);
        if (r?.whatsapps.length) bits.push(`${r.whatsapps.length} WhatsApp`);
        if (r?.ownerName) bits.push(`responsável: ${r.ownerName}`);
        if (r?.taxId) bits.push("CNPJ/NIF");
        setEnrichMsg(
          bits.length
            ? `Encontrado em ${r?.pagesScanned.length ?? 1} página(s): ${bits.join(", ")}.`
            : "Site varrido, mas nenhum dado novo de contato foi encontrado.",
        );
      } else {
        setEnrichMsg(json.error ?? "Falha ao enriquecer.");
      }
    } finally {
      setEnriching(false);
    }
  }

  async function fetchIg() {
    setIgBusy(true);
    setIgMsg(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}/instagram`, { method: "POST" });
      const data = (await res.json()) as { ok: boolean; lead?: ClientLead; error?: string };
      if (data.ok && data.lead) onPatched(data.lead);
      else setIgMsg(data.error ?? "Não foi possível consultar o perfil.");
    } catch {
      setIgMsg("Falha de conexão ao consultar a Meta.");
    } finally {
      setIgBusy(false);
    }
  }

  async function saveNotes() {
    setSavingNotes(true);
    try {
      await onUpdate(lead.id, { notes });
    } finally {
      setSavingNotes(false);
    }
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(mensagemFinal);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copie a mensagem:", mensagemFinal);
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
      />
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 38 }}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-white/[0.08] bg-panel shadow-2xl"
      >
        {/* Header */}
        <div className="border-b border-white/[0.07] p-5 md:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-volt/25 bg-volt/[0.07] font-display text-lg font-bold text-volt">
              {lead.companyName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-display text-[19px] font-bold text-white">
                {lead.companyName}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <StatusPill status={lead.status} />
                <OpportunityBadge opportunity={lead.opportunity} score={lead.websiteScore} />
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/[0.08] p-2 text-zinc-500 transition-colors hover:border-white/20 hover:text-white"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Status switch */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {LEAD_STATUSES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => onUpdate(lead.id, { status: s.key })}
                className={`rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition-all ${
                  lead.status === s.key
                    ? "border-volt bg-volt text-onvolt"
                    : "border-white/[0.09] text-zinc-500 hover:border-volt/40 hover:text-zinc-200"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-7 overflow-y-auto overflow-x-hidden p-5 md:p-6">
          {/* Contact */}
          <section>
            <SectionTitle>Dados de contato</SectionTitle>
            <div className="space-y-2.5 text-[13.5px]">
              <DrawerRow icon={User2} label="Responsável">
                {lead.ownerName ?? <span className="text-zinc-600">Não identificado</span>}
              </DrawerRow>
              <DrawerRow icon={Phone} label="Telefone">
                {phoneDisplay ?? <span className="text-zinc-600">—</span>}
              </DrawerRow>
              <DrawerRow icon={MessageCircle} label="WhatsApp">
                {whatsDisplay ?? <span className="text-zinc-600">Não identificado</span>}
              </DrawerRow>
              <DrawerRow icon={Mail} label="E-mail">
                {lead.email ? (
                  <a
                    href={`mailto:${lead.email}`}
                    className="break-all text-sky-300 hover:underline"
                  >
                    {lead.email}
                  </a>
                ) : (
                  <span className="text-zinc-600">—</span>
                )}
              </DrawerRow>
              <DrawerRow icon={MapPin} label="Endereço">
                {lead.address ? (
                  <a
                    href={mapsLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sky-300 hover:underline"
                  >
                    {lead.address}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-zinc-600">{lead.city ?? "—"}</span>
                )}
              </DrawerRow>
              <DrawerRow icon={Link2} label="Site">
                {lead.website ? (
                  <a
                    href={lead.website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-full items-center gap-1 text-sky-300 hover:underline"
                  >
                    <span className="min-w-0 break-all">
                      {lead.website.replace(/^https?:\/\//, "").slice(0, 42)}
                    </span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                ) : (
                  <span className="font-semibold text-rose-300">Não possui site</span>
                )}
              </DrawerRow>
              {lead.phoneAlt && (
                <DrawerRow icon={Phone} label="Tel. 2">
                  {formatPhone(lead.phoneAlt, lead.country) ?? lead.phoneAlt}
                </DrawerRow>
              )}
              {lead.openingHours && (
                <DrawerRow icon={Clock4} label="Horários">
                  <span className="text-[12.5px] text-zinc-400">{lead.openingHours}</span>
                </DrawerRow>
              )}
              {(lead.instagram || lead.facebook || lead.linkedin) && (
                <DrawerRow icon={Share2} label="Redes">
                  <span className="flex flex-wrap gap-2">
                    {[
                      { url: lead.instagram, name: "Instagram" },
                      { url: lead.facebook, name: "Facebook" },
                      { url: lead.linkedin, name: "LinkedIn" },
                    ]
                      .filter((s) => s.url)
                      .map((s) => (
                        <a
                          key={s.name}
                          href={s.url as string}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11.5px] font-semibold text-sky-300 hover:border-volt/40"
                        >
                          {s.name}
                        </a>
                      ))}
                  </span>
                </DrawerRow>
              )}
              {lead.instagram && (
                <DrawerRow icon={AtSign} label="Instagram">
                  {lead.igFollowers != null ? (
                    <span className="text-[12.5px] text-zinc-300">
                      <span className="font-bold text-fuchsia-300 tabular-nums">
                        {lead.igFollowers.toLocaleString("pt-BR")}
                      </span>{" "}
                      seguidores
                      {lead.igMediaCount != null && (
                        <span className="text-zinc-500">
                          {" · "}
                          {lead.igMediaCount.toLocaleString("pt-BR")} publicações
                        </span>
                      )}
                      {lead.igBiography && (
                        <span className="mt-1 block text-[12px] leading-relaxed text-zinc-500">
                          {lead.igBiography}
                        </span>
                      )}
                    </span>
                  ) : lead.igCheckedAt ? (
                    <span className="text-[12.5px] text-zinc-500">
                      Consultado — perfil pessoal ou inexistente (a API da Meta só
                      enxerga contas Business/Creator).
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={fetchIg}
                      disabled={igBusy}
                      className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-400/30 px-3 py-1 text-[11.5px] font-semibold text-fuchsia-300 hover:border-fuchsia-400/60 disabled:opacity-50"
                    >
                      {igBusy ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Users className="h-3 w-3" />
                      )}
                      Buscar seguidores
                    </button>
                  )}
                  {igMsg && (
                    <span className="mt-1 block text-[11.5px] text-amber-300/80">{igMsg}</span>
                  )}
                </DrawerRow>
              )}
              {(lead.rating != null || lead.categoryRaw) && (
                <DrawerRow icon={Star} label="Perfil">
                  <span className="text-[12.5px] text-zinc-400">
                    {lead.rating != null
                      ? `Nota ${lead.rating.toFixed(1)}${lead.reviewsCount ? ` · ${lead.reviewsCount} avaliações` : ""}`
                      : ""}
                    {lead.rating != null && lead.categoryRaw ? " · " : ""}
                    {lead.categoryRaw ?? ""}
                  </span>
                </DrawerRow>
              )}
              {typeof (lead.extra as { taxId?: string } | null)?.taxId === "string" && (
                <DrawerRow icon={Building2} label="CNPJ/NIF">
                  {(lead.extra as { taxId?: string }).taxId}
                </DrawerRow>
              )}
            </div>

            {/* Deep enrichment */}
            <div className="mt-3.5 rounded-xl border border-white/[0.07] bg-ink/50 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 text-[12.5px] font-bold text-zinc-100">
                    <Sparkles className="h-3.5 w-3.5 text-volt" />
                    Coleta profunda
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-zinc-500">
                    {lead.enrichedAt
                      ? `Site varrido ${timeAgo(lead.enrichedAt)} — e-mails, WhatsApp, sócios e redes.`
                      : "Varre o site do lead atrás de e-mail, WhatsApp, responsável, CNPJ e redes sociais."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={enrich}
                  disabled={enriching || !lead.website}
                  title={lead.website ? "" : "Lead sem site para varrer"}
                  className="inline-flex items-center gap-2 rounded-full border border-volt/30 bg-volt/[0.08] px-4 py-2 text-[12px] font-bold text-volt transition-colors hover:bg-volt/[0.16] disabled:opacity-40"
                >
                  {enriching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="h-3.5 w-3.5" />
                  )}
                  {lead.enrichedAt ? "Varrer de novo" : "Enriquecer lead"}
                </button>
              </div>
              {enrichMsg && (
                <p className="mt-2.5 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[11.5px] text-zinc-300">
                  {enrichMsg}
                </p>
              )}
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {lead.googleMapsUri && (
                  <a
                    href={lead.googleMapsUri}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-zinc-300 hover:border-volt/40"
                  >
                    <Map className="h-3 w-3" />
                    Google Maps
                  </a>
                )}
                {lead.email && (
                  <a
                    href={`mailto:${lead.email}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-zinc-300 hover:border-volt/40"
                  >
                    <AtSign className="h-3 w-3" />
                    Enviar e-mail
                  </a>
                )}
                {lead.lat != null && lead.lon != null && (
                  <span className="rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-1 font-mono text-[10.5px] text-zinc-500">
                    {lead.lat.toFixed(4)}, {lead.lon.toFixed(4)}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-3.5 flex flex-wrap gap-2">
              {waLink && (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2.5 text-[12.5px] font-bold text-white transition-transform hover:scale-[1.03]"
                >
                  <MessageCircle className="h-4 w-4" />
                  Chamar no WhatsApp
                </a>
              )}
              {lead.phone && (
                <a
                  href={`tel:+${lead.phone.replace(/\D/g, "")}`}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2.5 text-[12.5px] font-semibold text-zinc-200 transition-colors hover:border-volt/40 hover:text-volt"
                >
                  <Phone className="h-4 w-4" />
                  Ligar
                </a>
              )}
              {!waLink && lead.phone && toWhatsappDigits(lead.phone, lead.country) && (
                <a
                  href={`https://wa.me/${toWhatsappDigits(lead.phone, lead.country)}`}
                  target="_blank"
                  rel="noreferrer"
                  title="Abre o WhatsApp com este fixo. Se o número não tiver conta, o próprio WhatsApp avisa."
                  className="inline-flex items-center gap-2 rounded-full border border-dashed border-emerald-400/40 px-4 py-2.5 text-[12.5px] font-semibold text-emerald-300 transition-colors hover:border-emerald-400/80"
                >
                  <MessageCircle className="h-4 w-4" />
                  Testar fixo no WhatsApp
                </a>
              )}
              {lead.whatsapp && (
                <button
                  type="button"
                  onClick={() => setShowQr((v) => !v)}
                  aria-expanded={showQr}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[12.5px] font-semibold transition-colors ${
                    showQr
                      ? "border-volt/50 bg-volt/10 text-volt"
                      : "border-white/15 text-zinc-200 hover:border-volt/40 hover:text-volt"
                  }`}
                >
                  <QrCode className="h-4 w-4" />
                  QR Code
                </button>
              )}
            </div>
            {showQr && lead.whatsapp && (
              <div className="mt-3.5 flex items-center gap-4 rounded-xl border border-white/[0.09] bg-white/[0.03] p-4">
                {/* Fundo branco fixo: QR sobre fundo escuro nao e lido de forma confiavel. */}
                <div className="shrink-0 rounded-lg bg-white p-2.5">
                  <QRCodeSVG
                    value={`https://wa.me/${lead.whatsapp}`}
                    size={132}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#000000"
                  />
                </div>
                <div className="min-w-0 text-[12.5px] leading-relaxed text-zinc-400">
                  <p className="font-semibold text-zinc-200">
                    Escaneie pelo WhatsApp
                  </p>
                  <p className="mt-1">
                    No celular: WhatsApp → <span className="text-zinc-300">Configurações</span> →
                    ícone de QR → <span className="text-zinc-300">Escanear</span>. A conversa
                    com o cliente abre direto, sem precisar salvar o contato.
                  </p>
                  <p className="mt-2 font-mono text-[12px] text-zinc-300">
                    +{lead.whatsapp}
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* Site health */}
          <section>
            <SectionTitle>Saúde do site</SectionTitle>
            {!lead.website ? (
              <div className="rounded-xl border border-rose-400/25 bg-rose-400/[0.06] p-4">
                <div className="flex items-center gap-2 text-[13.5px] font-bold text-rose-300">
                  <Globe className="h-4 w-4" />
                  Oportunidade máxima
                </div>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-rose-200/70">
                  Esta empresa não tem site próprio. É o lead mais quente do funil —
                  a dor é clara e a proposta é direta.
                </p>
              </div>
            ) : lead.analyzedAt ? (
              <div className="rounded-xl border border-white/[0.07] bg-ink/60 p-4">
                <div className="flex items-center gap-5">
                  <ScoreDial score={lead.websiteScore ?? 0} size={118} />
                  <div className="flex-1">
                    <p className="text-[12.5px] leading-relaxed text-zinc-400">
                      Análise técnica de{" "}
                      <span className="text-zinc-200">
                        {lead.website.replace(/^https?:\/\//, "").slice(0, 40)}
                      </span>{" "}
                      — {timeAgo(lead.analyzedAt)}.
                    </p>
                    <button
                      type="button"
                      onClick={analyze}
                      disabled={analyzing}
                      className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-volt hover:underline disabled:opacity-50"
                    >
                      {analyzing ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      Refazer análise
                    </button>
                  </div>
                </div>
                <ul className="mt-4 space-y-2 border-t border-white/[0.06] pt-4">
                  {checks.map((c) => (
                    <li key={c.id} className="flex items-start gap-2.5 text-[12.5px]">
                      {c.status === "pass" ? (
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      ) : c.status === "warn" ? (
                        <Stethoscope className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                      ) : (
                        <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                      )}
                      <div>
                        <span className="font-semibold text-zinc-200">{c.label}</span>
                        <span className="text-zinc-500"> — {c.detail}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <button
                type="button"
                onClick={analyze}
                disabled={analyzing}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] py-5 text-[13px] font-semibold text-zinc-300 transition-colors hover:border-volt/40 hover:text-volt disabled:opacity-60"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analisando o site ao vivo…
                  </>
                ) : (
                  <>
                    <Stethoscope className="h-4 w-4" />
                    Analisar o site agora
                  </>
                )}
              </button>
            )}
          </section>

          {/* WhatsApp approach */}
          <section>
            <SectionTitle>Abordagem pronta</SectionTitle>
            <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
              {MESSAGE_STYLES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => {
                    setMsgStyle(s.key);
                    setEditado(null);
                  }}
                  className={`rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-colors ${
                    msgStyle === s.key
                      ? "border-volt/50 bg-volt/10 text-volt"
                      : "border-white/[0.09] text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {s.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setMsgVariant((v) => v + 1);
                  setEditado(null);
                }}
                title="Gera outra redação com o mesmo estilo"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] px-3 py-1 text-[11.5px] font-semibold text-zinc-500 transition-colors hover:border-volt/40 hover:text-volt"
              >
                <RefreshCw className="h-3 w-3" />
                Variar
              </button>
              {temDiagnostico && (
                <button
                  type="button"
                  onClick={() => {
                    setUsarDiagnostico((v) => !v);
                    setEditado(null);
                  }}
                  title="Cita no texto os problemas concretos achados na análise do site"
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-colors ${
                    usarDiagnostico
                      ? "border-volt/50 bg-volt/10 text-volt"
                      : "border-white/[0.09] text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  <Stethoscope className="h-3 w-3" />
                  Usar diagnóstico
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setIncluirSobre((v) => !v);
                  setEditado(null);
                }}
                title="Acrescenta um parágrafo com os diferenciais da kreativ.ae"
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-colors ${
                  incluirSobre
                    ? "border-volt/50 bg-volt/10 text-volt"
                    : "border-white/[0.09] text-zinc-500 hover:text-zinc-200"
                }`}
              >
                <Sparkles className="h-3 w-3" />
                Diferenciais
              </button>
              <span className="ml-auto text-[11px] font-medium text-zinc-600">
                {lead.country === "PT" ? "PT-PT" : "PT-BR"}
              </span>
            </div>
            <textarea
              value={mensagemFinal}
              onChange={(e) => setEditado(e.target.value)}
              rows={mensagemFinal.split("\n").length + 1}
              spellCheck
              className="w-full resize-y rounded-xl border border-white/[0.07] bg-ink/60 p-4 font-sans text-[12.5px] leading-relaxed text-zinc-300 outline-none transition-colors focus:border-volt/40"
            />
            {editado !== null && (
              <div className="mt-1.5 flex items-center gap-2 text-[11.5px] text-zinc-500">
                <span>Texto editado por você.</span>
                <button
                  type="button"
                  onClick={() => setEditado(null)}
                  className="font-semibold text-volt hover:underline"
                >
                  Restaurar o gerado
                </button>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copyMessage}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2.5 text-[12.5px] font-semibold text-zinc-200 transition-colors hover:border-volt/40 hover:text-volt"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-volt" />
                ) : (
                  <ClipboardCopy className="h-4 w-4" />
                )}
                {copied ? "Copiada!" : "Copiar mensagem"}
              </button>
              {waLink && (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-volt px-4 py-2.5 text-[12.5px] font-bold text-onvolt transition-transform hover:scale-[1.03]"
                >
                  <MessageCircle className="h-4 w-4" />
                  Enviar com mensagem pronta
                </a>
              )}
            </div>
          </section>

          {/* Notes */}
          <section>
            <SectionTitle>Anotações</SectionTitle>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Ex.: Respondeu no dia 12/09, pediu proposta até sexta…"
              className="w-full resize-none rounded-xl border border-white/[0.09] bg-ink px-4 py-3 text-[13px] text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-volt/50"
            />
            <button
              type="button"
              onClick={saveNotes}
              disabled={savingNotes}
              className="mt-2.5 inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[12.5px] font-semibold text-zinc-200 transition-colors hover:border-volt/40 hover:text-volt disabled:opacity-60"
            >
              {savingNotes && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Salvar anotações
            </button>
          </section>

          <div className="flex items-center justify-between border-t border-white/[0.06] pt-5 text-[11.5px] text-zinc-600">
            <span>Capturado {timeAgo(lead.createdAt)}</span>
            <button
              type="button"
              onClick={() => onDelete(lead.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/25 px-3 py-2 font-semibold text-rose-300 transition-colors hover:bg-rose-400/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Excluir lead
            </button>
          </div>
        </div>
      </motion.aside>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">
      {children}
    </h3>
  );
}

function DrawerRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Phone;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-1 h-3.5 w-3.5 shrink-0 text-zinc-600" />
      <span className="w-20 shrink-0 text-[12px] font-medium text-zinc-500">{label}</span>
      <span className="min-w-0 flex-1 break-words text-zinc-200">{children}</span>
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-volt" />
        </div>
      }
    >
      <LeadsApp />
    </Suspense>
  );
}
