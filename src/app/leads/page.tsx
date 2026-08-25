"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
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
  Globe,
  Link2,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Stethoscope,
  Trash2,
  User2,
  Users,
  X,
} from "lucide-react";
import { LEAD_STATUSES } from "@/lib/constants";
import { buildWhatsappMessage, waMeLink } from "@/lib/messages";
import { formatPhone } from "@/lib/phone";
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
  segments: string[];
  cities: string[];
}

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
  const [sort, setSort] = useState<"recent" | "score">("recent");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (qDebounced) params.set("q", qDebounced);
    if (segment) params.set("segment", segment);
    if (city) params.set("city", city);
    if (status) params.set("status", status);
    if (opportunity) params.set("opportunity", opportunity);
    if (onlyWhats) params.set("whatsapp", "1");
    params.set("sort", sort);
    params.set("limit", "120");
    try {
      const res = await fetch(`/api/leads?${params.toString()}`);
      const json = (await res.json()) as LeadsResponse;
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [qDebounced, segment, city, status, opportunity, onlyWhats, sort]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const leads = useMemo(() => data?.leads ?? [], [data]);
  const selected = leads.find((l) => l.id === selectedId) ?? null;

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
      <div className="flex flex-wrap items-end justify-between gap-4">
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
      </div>

      {/* Filter bar */}
      <div className="sticky top-14 z-30 -mx-1 rounded-2xl border border-white/[0.07] bg-ink/85 px-4 py-3.5 backdrop-blur-xl lg:top-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-52 flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Empresa, responsável ou telefone…"
              className="w-full rounded-xl border border-white/[0.09] bg-ink py-2.5 pl-10 pr-4 text-[13px] text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-volt/50"
            />
          </div>
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
            onChange={(v) => setSort(v === "score" ? "score" : "recent")}
            placeholder="Ordenar"
            options={[
              { value: "recent", label: "Mais recentes" },
              { value: "score", label: "Dados mais completos" },
            ]}
          />
          <button
            type="button"
            onClick={() => setOnlyWhats((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[12.5px] font-semibold transition-all ${
              onlyWhats
                ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300"
                : "border-white/[0.09] text-zinc-500 hover:text-zinc-200"
            }`}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Só WhatsApp
          </button>
        </div>
      </div>

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
        <motion.ul layout className="grid gap-3.5 md:grid-cols-2 2xl:grid-cols-3">
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
        className={`appearance-none rounded-xl border border-white/[0.09] bg-ink py-2.5 pl-3.5 pr-9 text-[12.5px] font-medium outline-none transition-colors focus:border-volt/50 ${
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
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
            <MessageCircle className="h-3 w-3" />
            WhatsApp
          </span>
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

  useEffect(() => setNotes(lead.notes ?? ""), [lead.id, lead.notes]);

  const message = buildWhatsappMessage(lead);
  const waLink = waMeLink(lead.whatsapp, message);
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
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copie a mensagem:", message);
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
        <div className="flex-1 space-y-7 overflow-y-auto p-5 md:p-6">
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
                  <a href={`mailto:${lead.email}`} className="text-sky-300 hover:underline">
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
                    className="inline-flex items-center gap-1 text-sky-300 hover:underline"
                  >
                    {lead.website.replace(/^https?:\/\//, "").slice(0, 42)}
                    <ExternalLink className="h-3 w-3" />
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
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-4 py-2.5 text-[12.5px] font-bold text-emerald-950 transition-transform hover:scale-[1.03]"
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
            </div>
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
            <pre className="whitespace-pre-wrap rounded-xl border border-white/[0.07] bg-ink/60 p-4 font-sans text-[12.5px] leading-relaxed text-zinc-300">
              {message}
            </pre>
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
