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
import {
  LeadDrawer,
  formatFollowers,
  type ClientLead,
} from "@/components/lead-drawer";

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

  // Navegacao pela lista visivel. Um lead aberto por link direto (?lead=)
  // pode nao estar nela — nesse caso as setas ficam desativadas.
  const posicao = leads.findIndex((l) => l.id === selectedId);
  const irPara = (i: number) => setSelectedId(leads[i].id);

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
            onPrev={posicao > 0 ? () => irPara(posicao - 1) : undefined}
            onNext={
              posicao >= 0 && posicao < leads.length - 1
                ? () => irPara(posicao + 1)
                : undefined
            }
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
