"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import {
  AtSign,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Clock4,
  ExternalLink,
  Globe,
  Link2,
  Loader2,
  Mail,
  Map,
  Pencil,
  MapPin,
  MessageCircle,
  Phone,
  QrCode,
  RefreshCw,
  Search,
  Share2,
  Sparkles,
  Star,
  Stethoscope,
  Trash2,
  User2,
  UserPlus,
  Users,
  Wand2,
  X,
  XCircle,
} from "lucide-react";
import { LEAD_STATUSES } from "@/lib/constants";
import {
  buildWhatsappParts,
  MESSAGE_STYLES,
  waMeLink,
  type MessageStyle,
} from "@/lib/messages";
import { formatPhone, toWhatsappDigits } from "@/lib/phone";
import { timeAgo } from "@/lib/format";
import { OpportunityBadge, StatusPill, statusLabel } from "@/components/badges";
import { ScoreDial } from "@/components/charts";
import type { SiteCheck } from "@/lib/site-analyzer";

export interface ClientLead {
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


export function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".", ",")} mil`;
  return String(n);
}


export function LeadDrawer({
  lead,
  onClose,
  onUpdate,
  onPatched,
  onDelete,
  onPrev,
  onNext,
}: {
  lead: ClientLead;
  onClose: () => void;
  /** Navegacao pela lista de origem; ausente = nao ha vizinho daquele lado. */
  onPrev?: () => void;
  onNext?: () => void;
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
  const [editado, setEditado] = useState<string[] | null>(null);
  const [copiadoIdx, setCopiadoIdx] = useState<number | null>(null);
  const [modoBloco, setModoBloco] = useState(false);
  const [editandoContato, setEditandoContato] = useState(false);
  const [salvandoContato, setSalvandoContato] = useState(false);
  const [erroContato, setErroContato] = useState<string | null>(null);
  const [form, setForm] = useState({
    ownerName: "",
    phone: "",
    whatsapp: "",
    email: "",
  });

  function abrirEdicao() {
    setForm({
      ownerName: lead.ownerName ?? "",
      phone: lead.phone ?? "",
      // Mostra com + para ficar claro que o codigo do pais faz parte.
      whatsapp: lead.whatsapp ? `+${lead.whatsapp}` : "",
      email: lead.email ?? "",
    });
    setErroContato(null);
    setEditandoContato(true);
  }

  async function salvarContato() {
    setSalvandoContato(true);
    setErroContato(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerName: form.ownerName,
          phone: form.phone,
          whatsapp: form.whatsapp,
          email: form.email,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        lead?: ClientLead;
        error?: string;
      };
      if (data.ok && data.lead) {
        onPatched(data.lead);
        setEditandoContato(false);
      } else {
        setErroContato(data.error ?? "Não foi possível salvar.");
      }
    } catch {
      setErroContato("Falha de conexão.");
    } finally {
      setSalvandoContato(false);
    }
  }

  useEffect(() => setNotes(lead.notes ?? ""), [lead.id, lead.notes]);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      // Combinacoes com modificador sao atalhos do navegador.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // As setas nao podem ser sequestradas enquanto se digita: o cursor
      // dentro das notas ou da mensagem precisa continuar funcionando.
      const alvo = e.target as HTMLElement | null;
      if (
        alvo &&
        (alvo.tagName === "INPUT" ||
          alvo.tagName === "TEXTAREA" ||
          alvo.tagName === "SELECT" ||
          alvo.isContentEditable)
      )
        return;
      if (e.key === "ArrowRight" && onNext) {
        e.preventDefault();
        onNext();
      } else if (e.key === "ArrowLeft" && onPrev) {
        e.preventDefault();
        onPrev();
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onClose, onNext, onPrev]);

  const temDiagnostico = (lead.websiteChecks?.length ?? 0) > 0;
  const partesGeradas = buildWhatsappParts(lead, {
    style: msgStyle,
    variant: msgVariant,
    useAnalysis: usarDiagnostico && temDiagnostico,
    includeAbout: incluirSobre,
  });
  // Editar uma parte congela todas: senao um clique em "Variar" trocaria as
  // nao editadas e a mensagem viraria uma colcha de retalhos.
  const partes = editado ?? partesGeradas;
  const mensagemFinal = partes.join("\n\n");
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
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={onPrev}
                disabled={!onPrev}
                title="Lead anterior (←)"
                aria-label="Lead anterior"
                className="rounded-lg border border-white/[0.08] p-2 text-zinc-500 transition-colors hover:border-white/20 hover:text-white disabled:opacity-30 disabled:hover:border-white/[0.08]"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onNext}
                disabled={!onNext}
                title="Próximo lead (→)"
                aria-label="Próximo lead"
                className="rounded-lg border border-white/[0.08] p-2 text-zinc-500 transition-colors hover:border-white/20 hover:text-white disabled:opacity-30 disabled:hover:border-white/[0.08]"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="ml-1 rounded-lg border border-white/[0.08] p-2 text-zinc-500 transition-colors hover:border-white/20 hover:text-white"
                title="Fechar (Esc)"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
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
            <div className="flex items-center justify-between">
              <SectionTitle>Dados de contato</SectionTitle>
              {!editandoContato && (
                <button
                  type="button"
                  onClick={abrirEdicao}
                  title="Corrigir telefone, WhatsApp, e-mail ou responsável"
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] px-3 py-1 text-[11.5px] font-semibold text-zinc-500 transition-colors hover:border-volt/40 hover:text-volt"
                >
                  <Pencil className="h-3 w-3" />
                  Editar
                </button>
              )}
            </div>

            {editandoContato ? (
              <div className="space-y-2.5">
                {(
                  [
                    ["ownerName", "Responsável", "Nome de quem atende"],
                    ["phone", "Telefone", "+55 43 3322-1234"],
                    ["whatsapp", "WhatsApp", lead.country === "PT" ? "+351 912 345 678" : "+55 43 99999-9999"],
                    ["email", "E-mail", "contato@empresa.com"],
                  ] as const
                ).map(([campo, rotulo, exemplo]) => (
                  <label key={campo} className="block">
                    <span className="text-[11.5px] font-medium text-zinc-500">
                      {rotulo}
                    </span>
                    <input
                      value={form[campo]}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, [campo]: e.target.value }))
                      }
                      placeholder={exemplo}
                      className="mt-1 w-full rounded-xl border border-white/[0.09] bg-ink px-3.5 py-2.5 text-[13px] text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-volt/50"
                    />
                  </label>
                ))}
                <p className="text-[11.5px] leading-relaxed text-zinc-500">
                  O WhatsApp aceita fixo: se você viu o número no site do
                  cliente, ele vale mesmo sem cara de celular.
                </p>
                {erroContato && (
                  <p className="text-[12px] text-rose-300">{erroContato}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={salvarContato}
                    disabled={salvandoContato}
                    className="inline-flex items-center gap-2 rounded-full bg-volt px-4 py-2 text-[12.5px] font-bold text-onvolt disabled:opacity-50"
                  >
                    {salvandoContato ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditandoContato(false)}
                    className="rounded-full border border-white/[0.09] px-4 py-2 text-[12.5px] font-semibold text-zinc-400 transition-colors hover:text-zinc-100"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
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
            )}

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
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2.5 text-[12.5px] font-bold text-[#fff] transition-transform hover:scale-[1.03]"
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
              {(lead.phone || lead.whatsapp) && (
                <a
                  href={`/api/leads/${lead.id}/vcard`}
                  title="Baixa um .vcf — no iPhone e no Mac abre direto em Adicionar aos contactos"
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2.5 text-[12.5px] font-semibold text-zinc-200 transition-colors hover:border-volt/40 hover:text-volt"
                >
                  <UserPlus className="h-4 w-4" />
                  Salvar contato
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
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(
                  // Nome + cidade: so o nome traz homonimos de outras regioes.
                  `${lead.companyName} ${lead.city ?? ""}`.trim(),
                )}`}
                target="_blank"
                rel="noreferrer"
                title="Pesquisa a empresa no Google"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2.5 text-[12.5px] font-semibold text-zinc-200 transition-colors hover:border-volt/40 hover:text-volt"
              >
                <Search className="h-4 w-4" />
                Pesquisar no Google
              </a>
              <a
                href={
                  // Com o @perfil conhecido, ir direto nele e melhor que
                  // devolver o usuario para uma busca.
                  lead.instagram
                    ? lead.instagram
                    : `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(
                        lead.companyName,
                      )}`
                }
                target="_blank"
                rel="noreferrer"
                title={
                  lead.instagram
                    ? "Abre o perfil já descoberto no enriquecimento"
                    : "Pesquisa a empresa no Instagram"
                }
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2.5 text-[12.5px] font-semibold text-zinc-200 transition-colors hover:border-fuchsia-400/50 hover:text-fuchsia-300"
              >
                <AtSign className="h-4 w-4" />
                {lead.instagram ? "Abrir Instagram" : "Buscar no Instagram"}
              </a>
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
              <div className="ml-auto flex items-center gap-2">
                <div className="flex rounded-full border border-white/[0.09] p-0.5">
                  {[
                    { bloco: false, label: "Em partes" },
                    { bloco: true, label: "Bloco único" },
                  ].map((o) => (
                    <button
                      key={o.label}
                      type="button"
                      onClick={() => setModoBloco(o.bloco)}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                        modoBloco === o.bloco
                          ? "bg-volt/15 text-volt"
                          : "text-zinc-500 hover:text-zinc-200"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] font-medium text-zinc-600">
                  {lead.country === "PT" ? "PT-PT" : "PT-BR"}
                </span>
              </div>
            </div>
            {modoBloco ? (
              <textarea
                value={mensagemFinal}
                /* Reparte pela linha em branco: mantem uma unica fonte de
                   verdade, entao voltar para "Em partes" reflete a edicao. */
                onChange={(e) => setEditado(e.target.value.split(/\n{2,}/))}
                rows={mensagemFinal.split("\n").length + 2}
                spellCheck
                className="w-full resize-y rounded-xl border border-white/[0.07] bg-ink/60 p-4 font-sans text-[12.5px] leading-relaxed text-zinc-300 outline-none transition-colors focus:border-volt/40"
              />
            ) : (
              <>
            <p className="mb-2 text-[11.5px] leading-relaxed text-zinc-500">
              Mande uma parte de cada vez: sequência de mensagens curtas soa
              como conversa, bloco único soa como disparo automático.
            </p>
            <ol className="space-y-2">
              {partes.map((parte, i) => (
                <li
                  key={i}
                  className="group flex items-start gap-2.5 rounded-xl border border-white/[0.07] bg-ink/60 p-3 transition-colors focus-within:border-volt/40"
                >
                  <span className="mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/10 text-[10.5px] font-bold tabular-nums text-zinc-500">
                    {i + 1}
                  </span>
                  <textarea
                    value={parte}
                    onChange={(e) =>
                      setEditado(
                        partes.map((p, j) => (j === i ? e.target.value : p)),
                      )
                    }
                    rows={Math.max(2, Math.ceil(parte.length / 52))}
                    spellCheck
                    className="min-w-0 flex-1 resize-y bg-transparent font-sans text-[12.5px] leading-relaxed text-zinc-300 outline-none"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(parte);
                      } catch {
                        window.prompt("Copie esta parte:", parte);
                        return;
                      }
                      setCopiadoIdx(i);
                      setTimeout(() => setCopiadoIdx((v) => (v === i ? null : v)), 1600);
                    }}
                    title={`Copiar a parte ${i + 1}`}
                    aria-label={`Copiar a parte ${i + 1}`}
                    className="mt-0.5 shrink-0 rounded-lg border border-white/[0.08] p-2 text-zinc-500 transition-colors hover:border-volt/40 hover:text-volt"
                  >
                    {copiadoIdx === i ? (
                      <Check className="h-3.5 w-3.5 text-volt" />
                    ) : (
                      <ClipboardCopy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </li>
              ))}
            </ol>
              </>
            )}
            {editado !== null && (
              <div className="mt-2 flex items-center gap-2 text-[11.5px] text-zinc-500">
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
                {copied ? "Copiada!" : "Copiar tudo"}
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

