"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Clock5,
  Loader2,
  MessageSquare,
  Phone,
  SendHorizonal,
  Settings2,
  User2,
} from "lucide-react";
import { timeAgo } from "@/lib/format";

interface ConversationRow {
  id: string;
  contactPhone: string;
  contactName: string | null;
  leadId: string | null;
  leadCompany: string | null;
  leadSegment: string | null;
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
  const [convos, setConvos] = useState<ConversationRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConvos = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      const data = (await res.json()) as {
        conversations: ConversationRow[];
        wa_configured: boolean;
      };
      setConvos(data.conversations);
      setWaConfigured(data.wa_configured);
    } catch {
      /* retry on interval */
    }
  }, []);

  const loadThread = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`);
      const data = (await res.json()) as { messages: ThreadMessage[] };
      setThread(data.messages);
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

      <div className="grid overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] lg:grid-cols-[340px_1fr]">
        {/* Conversation list */}
        <div
          className={`border-b border-white/[0.06] lg:border-b-0 lg:border-r ${
            activeId ? "hidden lg:block" : ""
          }`}
        >
          <div className="border-b border-white/[0.06] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            Caixa de entrada
          </div>
          {convos.length === 0 ? (
            <div className="px-6 py-14 text-center text-[13px] leading-relaxed text-zinc-500">
              Quando alguém chamar no WhatsApp da empresa, a conversa aparece aqui
              automaticamente.
            </div>
          ) : (
            <ul className="max-h-[65vh] divide-y divide-white/[0.05] overflow-y-auto">
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

        {/* Thread */}
        <div className={`flex min-h-[65vh] flex-col ${activeId ? "" : "hidden lg:flex"}`}>
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
              <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
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
                  </div>
                </div>
              </div>

              {windowExpired && (
                <div className="border-b border-amber-300/20 bg-amber-300/[0.06] px-4 py-2.5 text-[12px] leading-relaxed text-amber-200/85">
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
                          <p className="whitespace-pre-wrap break-words">{m.body}</p>
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
                <div className="border-t border-rose-400/20 bg-rose-400/[0.06] px-4 py-2.5 text-[12px] text-rose-300">
                  {sendError}
                </div>
              )}

              {/* Composer */}
              <div className="flex items-end gap-2 border-t border-white/[0.06] p-3">
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
                  placeholder="Escreva uma mensagem…"
                  className="max-h-32 flex-1 resize-none rounded-xl border border-white/[0.09] bg-ink px-4 py-3 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-volt/50"
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={sending || !composer.trim()}
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
