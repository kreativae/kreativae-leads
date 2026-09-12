"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { upload } from "@vercel/blob/client";
import {
  ArrowLeft,
  AtSign,
  Check,
  CheckCheck,
  Clock5,
  ExternalLink,
  FileText,
  Globe2,
  Info,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Paperclip,
  Phone,
  SendHorizonal,
  Settings2,
  Star,
  Trash2,
  User2,
} from "lucide-react";
import { timeAgo } from "@/lib/format";

interface LeadDetail {
  companyName: string;
  ownerName: string | null;
  phone: string | null;
  phoneAlt: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  linkedin: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  rating: number | null;
  reviewsCount: number | null;
  status: string;
  opportunity: string;
  notes: string | null;
  googleMapsUri: string | null;
}

interface ConversationRow {
  id: string;
  contactPhone: string;
  contactName: string | null;
  leadId: string | null;
  leadCompany: string | null;
  leadSegment: string | null;
  // Qual dos numeros da empresa recebeu — so aparece quando ha mais de um
  // cadastrado (ver waAccounts abaixo).
  waAccountLabel: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastInboundAt: string | null;
  unreadCount: number;
}

interface ThreadMessage {
  id: string;
  direction: string;
  body: string;
  status: string;
  createdAt: string;
  type: string;
  mediaUrl: string | null;
  mimeType: string | null;
  fileName: string | null;
}

const LIMITE_ARQUIVO_MB = 64;

function nomeStatusLead(s: string): string {
  const mapa: Record<string, string> = {
    new: "Novo",
    contacted: "Contatado",
    negotiating: "Negociando",
    won: "Ganho",
    lost: "Perdido",
  };
  return mapa[s] ?? s;
}

function displayPhone(digits: string): string {
  if (digits.startsWith("55") && digits.length >= 12) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    return rest.length === 9
      ? `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`
      : `+55 (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  if (digits.startsWith("351") && digits.length === 12) {
    return `+351 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  return `+${digits}`;
}

export default function ConversasPage() {
  const [waConfigured, setWaConfigured] = useState<boolean | null>(null);
  const [waEnabled, setWaEnabled] = useState(true);
  const [waAccountsCount, setWaAccountsCount] = useState(0);
  // So mostra de qual numero veio quando ha mais de um: com um so, o rotulo
  // e ruido, todo mundo ja sabe qual e.
  const mostrarContas = waAccountsCount > 1;
  const [convos, setConvos] = useState<ConversationRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadConvos = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      const data = (await res.json()) as {
        conversations: ConversationRow[];
        wa_configured: boolean;
        wa_enabled?: boolean;
        waAccounts?: { id: string; label: string }[];
      };
      setConvos(data.conversations);
      setWaConfigured(data.wa_configured);
      if (typeof data.wa_enabled === "boolean") setWaEnabled(data.wa_enabled);
      setWaAccountsCount(data.waAccounts?.length ?? 0);
    } catch {
      /* retry on interval */
    }
  }, []);

  const loadThread = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`);
      const data = (await res.json()) as { messages: ThreadMessage[]; lead: LeadDetail | null };
      setThread(data.messages);
      setLead(data.lead);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    loadConvos();
    const t = setInterval(loadConvos, 10_000);
    return () => clearInterval(t);
  }, [loadConvos]);

  useEffect(() => {
    setShowContact(false);
    setConfirmDelete(false);
    if (!activeId) return;
    setLoadingThread(true);
    loadThread(activeId).finally(() => setLoadingThread(false));
    fetch(`/api/conversations/${activeId}`, { method: "PATCH" }).then(() => {
      loadConvos();
      window.dispatchEvent(new CustomEvent("kreatae:conversations-read"));
    });
    const t = setInterval(() => loadThread(activeId), 4_000);
    return () => clearInterval(t);
  }, [activeId, loadThread, loadConvos]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.length]);

  const active = convos.find((c) => c.id === activeId) ?? null;
  const windowExpired =
    active?.lastInboundAt != null &&
    Date.now() - new Date(active.lastInboundAt).getTime() > 24 * 60 * 60 * 1000;

  async function send() {
    if (!activeId || !composer.trim() || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/conversations/${activeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: composer.trim() }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setSendError(data.error ?? "Falha no envio.");
      } else {
        setComposer("");
        await loadThread(activeId);
        loadConvos();
      }
    } finally {
      setSending(false);
    }
  }

  async function enviarArquivo(file: File) {
    if (!activeId || uploadingFile) return;
    if (file.size > LIMITE_ARQUIVO_MB * 1024 * 1024) {
      setSendError(`Arquivo maior que ${LIMITE_ARQUIVO_MB}MB — reduza o tamanho e tente de novo.`);
      return;
    }
    setUploadingFile(true);
    setSendError(null);
    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/blob-upload",
      });
      const res = await fetch(`/api/conversations/${activeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaUrl: blob.url,
          mimeType: blob.contentType || file.type || "application/octet-stream",
          filename: file.name,
          body: composer.trim(),
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setSendError(data.error ?? "Falha no envio do arquivo.");
      } else {
        setComposer("");
        await loadThread(activeId);
        loadConvos();
      }
    } catch {
      setSendError("Falha ao subir o arquivo.");
    } finally {
      setUploadingFile(false);
    }
  }

  async function excluirConversa() {
    if (!activeId || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/conversations/${activeId}`, { method: "DELETE" });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        setConvos((cs) => cs.filter((c) => c.id !== activeId));
        setActiveId(null);
        setConfirmDelete(false);
      } else {
        setSendError(data.error ?? "Falha ao excluir.");
      }
    } finally {
      setDeleting(false);
    }
  }

  if (!waEnabled) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-white/[0.09] px-6 py-24 text-center">
        <MessageSquare className="h-9 w-9 text-zinc-600" />
        <h1 className="font-display text-xl font-bold text-white">
          Omnichannel desativado
        </h1>
        <p className="max-w-md text-[13.5px] leading-relaxed text-zinc-500">
          O WhatsApp está desligado nas configurações, então a aba Conversas foi
          removida do menu. Reative quando quiser centralizar as conversas aqui.
        </p>
        <Link
          href="/configuracoes"
          className="inline-flex items-center gap-2 rounded-full bg-volt px-6 py-3 text-[13.5px] font-bold text-onvolt transition-transform hover:scale-[1.03]"
        >
          <Settings2 className="h-4 w-4" />
          Ir para Configurações
        </Link>
      </div>
    );
  }

  if (waConfigured === false) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-white/[0.09] px-6 py-24 text-center">
        <MessageSquare className="h-9 w-9 text-zinc-600" />
        <h1 className="font-display text-xl font-bold text-white">
          WhatsApp ainda não conectado
        </h1>
        <p className="max-w-md text-[13.5px] leading-relaxed text-zinc-500">
          Para centralizar as conversas da empresa aqui, conecte a WhatsApp Cloud API
          oficial da Meta — leva uns 10 minutos e o sistema te mostra o passo a passo.
        </p>
        <Link
          href="/configuracoes"
          className="inline-flex items-center gap-2 rounded-full bg-volt px-6 py-3 text-[13.5px] font-bold text-onvolt transition-transform hover:scale-[1.03]"
        >
          <Settings2 className="h-4 w-4" />
          Configurar agora
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
          <MessageSquare className="h-3.5 w-3.5" />
          Omnichannel
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
          Conversas
        </h1>
        <p className="mt-2 text-[14.5px] text-zinc-400">
          Todas as conversas do WhatsApp da empresa, vinculadas automaticamente aos leads.
        </p>
      </div>

      <div className="grid h-[calc(100vh-17rem)] min-h-[460px] grid-cols-1 overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] lg:grid-cols-[340px_1fr]">
        {/* Conversation list — altura travada, so a lista de conversas rola */}
        <div
          className={`flex h-full flex-col overflow-hidden border-b border-white/[0.06] lg:border-b-0 lg:border-r ${
            activeId ? "hidden lg:flex" : "flex"
          }`}
        >
          <div className="shrink-0 border-b border-white/[0.06] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            Caixa de entrada
          </div>
          {convos.length === 0 ? (
            <div className="px-6 py-14 text-center text-[13px] leading-relaxed text-zinc-500">
              Quando alguém chamar no WhatsApp da empresa, a conversa aparece aqui
              automaticamente.
            </div>
          ) : (
            <ul className="flex-1 divide-y divide-white/[0.05] overflow-y-auto">
              {convos.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(c.id)}
                    className={`w-full px-4 py-3.5 text-left transition-colors ${
                      activeId === c.id ? "bg-volt/[0.06]" : "hover:bg-white/[0.03]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-ink font-display text-[13px] font-bold text-volt">
                        {(c.leadCompany ?? c.contactName ?? c.contactPhone)
                          .slice(0, 1)
                          .toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[13.5px] font-semibold text-zinc-100">
                            {c.leadCompany ?? c.contactName ?? displayPhone(c.contactPhone)}
                          </span>
                          <span className="shrink-0 text-[10.5px] text-zinc-600">
                            {c.lastMessageAt ? timeAgo(c.lastMessageAt) : ""}
                          </span>
                        </div>
                        {mostrarContas && c.waAccountLabel && (
                          <span className="mt-0.5 inline-block rounded border border-white/[0.09] px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide text-zinc-500">
                            {c.waAccountLabel}
                          </span>
                        )}
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          <span className="truncate text-[12px] text-zinc-500">
                            {c.lastMessagePreview ?? displayPhone(c.contactPhone)}
                          </span>
                          {c.unreadCount > 0 && (
                            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-volt px-1.5 text-[10.5px] font-bold tabular-nums text-onvolt">
                              {c.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Thread — altura travada, so o corpo de mensagens rola */}
        <div className={`flex h-full flex-col overflow-hidden ${activeId ? "" : "hidden lg:flex"}`}>
          {!active ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-20 text-center">
              <MessageSquare className="h-8 w-8 text-zinc-700" />
              <p className="text-[13px] text-zinc-500">
                Selecione uma conversa para visualizar.
              </p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="flex shrink-0 items-center gap-3 border-b border-white/[0.06] px-4 py-3">
                <button
                  type="button"
                  onClick={() => setActiveId(null)}
                  className="rounded-lg border border-white/[0.08] p-1.5 text-zinc-400 lg:hidden"
                  aria-label="Voltar"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-bold text-zinc-100">
                    {active.leadCompany ?? active.contactName ?? displayPhone(active.contactPhone)}
                  </div>
                  <div className="flex items-center gap-2 text-[11.5px] text-zinc-500">
                    <Phone className="h-3 w-3" />
                    {displayPhone(active.contactPhone)}
                    {active.leadCompany && (
                      <span className="rounded border border-volt/25 bg-volt/[0.06] px-1.5 py-px text-[10px] font-bold text-volt">
                        LEAD VINCULADO
                      </span>
                    )}
                    {mostrarContas && active.waAccountLabel && (
                      <span className="rounded border border-white/[0.09] px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                        {active.waAccountLabel}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowContact((v) => !v)}
                  className={`rounded-lg border p-1.5 transition-colors ${
                    showContact
                      ? "border-volt/40 bg-volt/[0.08] text-volt"
                      : "border-white/[0.08] text-zinc-400 hover:text-zinc-200"
                  }`}
                  aria-label="Ver dados do contato"
                  title="Ver dados do contato"
                >
                  <Info className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="rounded-lg border border-white/[0.08] p-1.5 text-zinc-400 hover:border-rose-400/30 hover:text-rose-400"
                  aria-label="Excluir conversa"
                  title="Excluir conversa"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {/* Painel de contato */}
              <AnimatePresence initial={false}>
                {showContact && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="shrink-0 overflow-hidden border-b border-white/[0.06] bg-ink/40"
                  >
                    <div className="max-h-[40vh] space-y-2.5 overflow-y-auto px-4 py-4">
                      {!lead ? (
                        <p className="text-[12.5px] text-zinc-500">
                          Nenhum lead vinculado a este contato ainda.
                        </p>
                      ) : (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[13.5px] font-bold text-zinc-100">
                              {lead.companyName}
                              {lead.ownerName && (
                                <span className="ml-1.5 font-normal text-zinc-500">
                                  · {lead.ownerName}
                                </span>
                              )}
                            </p>
                            <div className="flex shrink-0 items-center gap-1.5 text-[11px]">
                              <span className="rounded border border-white/[0.09] px-1.5 py-px font-semibold uppercase tracking-wide text-zinc-400">
                                {nomeStatusLead(lead.status)}
                              </span>
                              {lead.rating != null && (
                                <span className="inline-flex items-center gap-0.5 text-amber-400">
                                  <Star className="h-3 w-3 fill-current" /> {lead.rating.toFixed(1)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-1.5 text-[12px] text-zinc-400 sm:grid-cols-2">
                            {lead.email && (
                              <a
                                href={`mailto:${lead.email}`}
                                className="flex items-center gap-1.5 truncate hover:text-volt"
                              >
                                <Mail className="h-3.5 w-3.5 shrink-0" /> {lead.email}
                              </a>
                            )}
                            {lead.website && (
                              <a
                                href={lead.website}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1.5 truncate hover:text-volt"
                              >
                                <Globe2 className="h-3.5 w-3.5 shrink-0" /> {lead.website}
                              </a>
                            )}
                            {lead.instagram && (
                              <a
                                href={lead.instagram}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1.5 truncate hover:text-volt"
                              >
                                <AtSign className="h-3.5 w-3.5 shrink-0" /> {lead.instagram}
                              </a>
                            )}
                            {(lead.address || lead.city) && (
                              <span className="flex items-center gap-1.5 truncate">
                                <MapPin className="h-3.5 w-3.5 shrink-0" />
                                {[lead.address, lead.neighborhood, lead.city, lead.state]
                                  .filter(Boolean)
                                  .join(", ")}
                              </span>
                            )}
                            {lead.googleMapsUri && (
                              <a
                                href={lead.googleMapsUri}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1.5 truncate hover:text-volt"
                              >
                                <ExternalLink className="h-3.5 w-3.5 shrink-0" /> Ver no Google Maps
                              </a>
                            )}
                          </div>
                          {lead.notes && (
                            <p className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[12px] leading-relaxed text-zinc-400">
                              {lead.notes}
                            </p>
                          )}
                          <Link
                            href={`/leads?lead=${active.leadId}`}
                            className="inline-flex items-center gap-1 text-[12px] font-semibold text-volt hover:underline"
                          >
                            Ver ficha completa do lead <ExternalLink className="h-3 w-3" />
                          </Link>
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Confirmacao de exclusao — modal proprio em vez de window.confirm */}
              <AnimatePresence>
                {confirmDelete && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                    onClick={() => !deleting && setConfirmDelete(false)}
                  >
                    <motion.div
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.95, opacity: 0 }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink p-5"
                    >
                      <h3 className="text-[15px] font-bold text-zinc-100">Excluir esta conversa?</h3>
                      <p className="mt-1.5 text-[12.5px] leading-relaxed text-zinc-500">
                        Remove a conversa e todas as mensagens do banco. Não dá para desfazer.
                      </p>
                      <div className="mt-4 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(false)}
                          disabled={deleting}
                          className="rounded-full border border-white/10 px-4 py-2 text-[12.5px] font-semibold text-zinc-300 hover:border-white/20"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={excluirConversa}
                          disabled={deleting}
                          className="inline-flex items-center gap-1.5 rounded-full bg-rose-500 px-4 py-2 text-[12.5px] font-bold text-white transition-opacity disabled:opacity-60"
                        >
                          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          Excluir
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {windowExpired && (
                <div className="shrink-0 border-b border-amber-300/20 bg-amber-300/[0.06] px-4 py-2.5 text-[12px] leading-relaxed text-amber-200/85">
                  Janela de 24h expirada: a Meta só permite reabrir esta conversa com uma
                  mensagem de template aprovada. Quando o cliente responder, o envio
                  livre é liberado de novo.
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
                {loadingThread ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-volt" />
                  </div>
                ) : (
                  <AnimatePresence initial={false}>
                    {thread.map((m) => (
                      <motion.div
                        key={m.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                            m.direction === "out"
                              ? "rounded-br-md bg-volt text-onvolt"
                              : "rounded-bl-md border border-white/[0.07] bg-white/[0.05] text-zinc-200"
                          }`}
                        >
                          {m.type === "image" && m.mediaUrl ? (
                            <a href={m.mediaUrl} target="_blank" rel="noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element -- URL do Blob e dinamica, sem dominio fixo pra configurar em next/image */}
                              <img
                                src={m.mediaUrl}
                                alt={m.body || "Imagem"}
                                className="mb-1.5 max-h-72 rounded-lg object-cover"
                              />
                            </a>
                          ) : m.type === "video" && m.mediaUrl ? (
                            <video controls src={m.mediaUrl} className="mb-1.5 max-h-72 rounded-lg" />
                          ) : m.type === "audio" && m.mediaUrl ? (
                            <audio controls src={m.mediaUrl} className="mb-1.5 w-56" />
                          ) : (m.type === "document" || m.type === "sticker") && m.mediaUrl ? (
                            <a
                              href={m.mediaUrl}
                              target="_blank"
                              rel="noreferrer"
                              className={`mb-1.5 flex items-center gap-2 rounded-lg border px-3 py-2 ${
                                m.direction === "out"
                                  ? "border-onvolt/20 bg-onvolt/[0.08]"
                                  : "border-white/[0.09] bg-white/[0.04]"
                              }`}
                            >
                              <FileText className="h-4 w-4 shrink-0" />
                              <span className="truncate text-[12.5px] font-medium underline-offset-2">
                                {m.fileName || "Arquivo"}
                              </span>
                            </a>
                          ) : null}
                          {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                          <div
                            className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                              m.direction === "out" ? "text-onvolt/70" : "text-zinc-600"
                            }`}
                          >
                            {new Date(m.createdAt).toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {m.direction === "out" &&
                              (m.status === "read" ? (
                                <CheckCheck className="h-3 w-3 text-sky-700" />
                              ) : m.status === "delivered" ? (
                                <CheckCheck className="h-3 w-3" />
                              ) : m.status === "sent" ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <Clock5 className="h-3 w-3" />
                              ))}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
                <div ref={bottomRef} />
              </div>

              {sendError && (
                <div className="shrink-0 border-t border-rose-400/20 bg-rose-400/[0.06] px-4 py-2.5 text-[12px] text-rose-300">
                  {sendError}
                </div>
              )}

              {/* Composer */}
              <div className="flex shrink-0 items-end gap-2 border-t border-white/[0.06] p-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) enviarArquivo(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingFile || sending}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.09] text-zinc-400 transition-colors enabled:hover:border-white/20 enabled:hover:text-zinc-200 disabled:opacity-40"
                  aria-label="Anexar arquivo"
                  title="Anexar arquivo"
                >
                  {uploadingFile ? (
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                  ) : (
                    <Paperclip className="h-4.5 w-4.5" />
                  )}
                </button>
                <textarea
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={1}
                  placeholder="Escreva uma mensagem… (a legenda de um anexo também sai daqui)"
                  className="max-h-32 flex-1 resize-none rounded-xl border border-white/[0.09] bg-ink px-4 py-3 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-volt/50"
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={sending || uploadingFile || !composer.trim()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-volt text-onvolt transition-transform enabled:hover:scale-105 disabled:opacity-40"
                  aria-label="Enviar mensagem"
                >
                  {sending ? (
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                  ) : (
                    <SendHorizonal className="h-4.5 w-4.5" />
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <p className="flex items-center gap-2 text-[12px] text-zinc-600">
        <User2 className="h-3.5 w-3.5" />
        Números que iniciam conversa são reconciliados com os leads pelo telefone/WhatsApp cadastrado.
      </p>
    </div>
  );
}
