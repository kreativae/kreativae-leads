"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import {
  AlertTriangle,
  AtSign,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ImagePlus,
  Loader2,
  Phone,
  Plus,
  RefreshCw,
  Sparkles,
  Stethoscope,
  Trash2,
  UploadCloud,
  Wand2,
  X,
} from "lucide-react";
import { formatPhone } from "@/lib/phone";

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

interface EnrichExtraSeed {
  taxId: string | null;
  emailsAlt: string[];
  whatsappAlt: string[];
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

interface Candidate {
  osmId: string;
  companyName: string;
  ownerName: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  categoryRaw: string | null;
  instagram: string | null;
  facebook: string | null;
  linkedin: string | null;
  existingLeadId: string | null;
  instagramHandle?: string | null;
  instagramFollowers?: number | null;
  instagramMediaCount?: number | null;
  instagramBio?: string | null;
  country: "BR" | "PT";
  adSummary: string;
  confidence: "alta" | "media" | "baixa";
  analysis: SiteAnalysis | null;
  enrichExtra: EnrichExtraSeed | null;
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
  country: "BR" | "PT";
}

interface QueueItem {
  id: string;
  imageUrl: string;
  status: "enviando" | "analisando" | "pronto" | "erro";
  candidate?: Candidate;
  edits?: Edits;
  error?: string;
  addedLeadId?: string;
  createdAt: number;
}

const CONCURRENCY = 2;
/** Acima disso, um item "enviando"/"analisando" travado é considerado órfão
 * (aba que fechou no meio do processo) — abaixo, pode ser outro aparelho
 * processando ao vivo, então não tocamos nele. */
const TRAVADO_MS = 2 * 60 * 1000;

interface FilaRow {
  id: string;
  imageUrl: string;
  status: string;
  candidato: Candidate | null;
  edicao: Edits | null;
  erro: string | null;
  leadAdicionadoId: string | null;
  criadoEm: string;
}

function linhaParaItem(r: FilaRow): QueueItem {
  return {
    id: r.id,
    imageUrl: r.imageUrl,
    status: (["enviando", "analisando", "pronto", "erro"] as const).includes(
      r.status as QueueItem["status"],
    )
      ? (r.status as QueueItem["status"])
      : "erro",
    candidate: r.candidato ?? undefined,
    edits: r.edicao ?? undefined,
    error: r.erro ?? undefined,
    addedLeadId: r.leadAdicionadoId ?? undefined,
    createdAt: new Date(r.criadoEm).getTime(),
  };
}

async function buscarFila(): Promise<QueueItem[]> {
  try {
    const res = await fetch("/api/ia/fila", { cache: "no-store" });
    const data = (await res.json()) as { ok: boolean; fila?: FilaRow[] };
    return data.ok && data.fila ? data.fila.map(linhaParaItem) : [];
  } catch {
    return [];
  }
}

/** Reflete uma mudança no servidor — fila compartilhada entre aparelhos. Falha aqui não
 * bloqueia a UI: o estado local já foi atualizado, e é reconciliado no próximo carregamento. */
function persistirItem(
  id: string,
  patch: Partial<{
    imageUrl: string;
    status: QueueItem["status"];
    candidato: Candidate | null;
    edicao: Edits | null;
    erro: string | null;
    leadAdicionadoId: string | null;
  }>,
) {
  fetch(`/api/ia/fila/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).catch(() => {});
}

function ehHeic(file: File): boolean {
  return /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

function desenharEExportar(
  fonte: CanvasImageSource,
  largura: number,
  altura: number,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(fonte, 0, 0, largura, altura);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}

/**
 * Normaliza qualquer imagem pra JPEG antes do upload. Resolve dois problemas
 * de uma vez: fotos HEIC/HEIF do iPhone (formato que a Cloud Vision da
 * Claude não aceita) e a miniatura não aparecendo em navegadores que não
 * sabem renderizar HEIC (só o Safari sabe). Tenta duas formas de decodificar
 * — createImageBitmap (mais rápido) e, se o navegador não suportar HEIC por
 * esse caminho, um <img> comum (é o caminho que o Safari usa até pra exibir
 * a foto na tela, então cobre casos que o createImageBitmap não cobre).
 * Se nenhuma funcionar, devolve null — quem chamou decide o que fazer, em
 * vez de tentar subir o HEIC original e repetir o mesmo erro.
 */
async function paraJpeg(file: File): Promise<File | null> {
  let blob: Blob | null = null;

  try {
    const bitmap = await createImageBitmap(file);
    blob = await desenharEExportar(bitmap, bitmap.width, bitmap.height);
  } catch {
    /* segue pro fallback via <img> abaixo */
  }

  if (!blob) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("decode falhou"));
        el.src = url;
      });
      blob = await desenharEExportar(img, img.naturalWidth, img.naturalHeight);
    } catch {
      blob = null;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  if (!blob) return null;
  const nome = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], nome, { type: "image/jpeg" });
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
    country: c.country,
  };
}

export default function IaPage() {
  const [fila, setFila] = useState<QueueItem[]>([]);
  const filaRef = useRef<QueueItem[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [analyses, setAnalyses] = useState<
    Record<string, { loading: boolean; result: SiteAnalysis | null; error: string | null }>
  >({});
  const [enrichments, setEnrichments] = useState<
    Record<string, { loading: boolean; result: EnrichResult | null; error: string | null }>
  >({});
  const filaArquivos = useRef<File[]>([]);
  const processando = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const debounceEdicao = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function atualizarFila(updater: (f: QueueItem[]) => QueueItem[]) {
    const novo = updater(filaRef.current);
    filaRef.current = novo;
    setFila(novo);
  }

  function atualizarItem(id: string, patch: Partial<QueueItem>) {
    atualizarFila((f) => f.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function edicaoDe(item: QueueItem): Edits {
    return item.edits ?? (item.candidate ? edicaoVazia(item.candidate) : ({} as Edits));
  }

  function atualizarEdicao(item: QueueItem, patch: Partial<Edits>) {
    const novaEdicao = { ...edicaoDe(item), ...patch };
    atualizarItem(item.id, { edits: novaEdicao });
    clearTimeout(debounceEdicao.current[item.id]);
    debounceEdicao.current[item.id] = setTimeout(() => {
      persistirItem(item.id, { edicao: novaEdicao });
    }, 700);
  }

  async function analisar(id: string, imageUrl: string) {
    atualizarItem(id, { status: "analisando", error: undefined });
    persistirItem(id, { status: "analisando", erro: null });
    try {
      const res = await fetch("/api/ia/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      });
      const data = (await res.json()) as { ok: boolean; candidate?: Candidate; error?: string };
      if (data.ok && data.candidate) {
        const edicao = edicaoVazia(data.candidate);
        atualizarItem(id, { status: "pronto", candidate: data.candidate, edits: edicao });
        persistirItem(id, { status: "pronto", candidato: data.candidate, edicao });
      } else {
        const erro = data.error ?? "Falha ao analisar.";
        atualizarItem(id, { status: "erro", error: erro });
        persistirItem(id, { status: "erro", erro });
      }
    } catch {
      atualizarItem(id, { status: "erro", error: "Erro de rede ao analisar." });
      persistirItem(id, { status: "erro", erro: "Erro de rede ao analisar." });
    }
  }

  useEffect(() => {
    buscarFila().then((linhas) => {
      const agora = Date.now();
      const inicial = linhas.map((it) => {
        const travado = agora - it.createdAt > TRAVADO_MS;
        if (it.status === "enviando" && travado) {
          const erro = "Envio interrompido — tente de novo.";
          persistirItem(it.id, { status: "erro", erro });
          return { ...it, status: "erro" as const, error: erro };
        }
        return it;
      });
      filaRef.current = inicial;
      setFila(inicial);
      for (const it of inicial) {
        const travado = agora - it.createdAt > TRAVADO_MS;
        if (it.status === "analisando" && it.imageUrl && travado) void analisar(it.id, it.imageUrl);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carga única na montagem; analisar não precisa disparar o efeito de novo
  }, []);

  async function processarArquivo(file: File) {
    const id = crypto.randomUUID();
    atualizarFila((f) => [
      { id, imageUrl: "", status: "enviando", createdAt: Date.now() },
      ...f,
    ]);
    persistirItem(id, { status: "enviando" });
    try {
      const arquivo = await paraJpeg(file);
      if (!arquivo) {
        const erro = ehHeic(file)
          ? "Este navegador não conseguiu converter esse HEIC. Tente enviar um print de tela (em vez de uma foto), ou abra esta página pelo Safari no iPhone/Mac."
          : "Não foi possível processar essa imagem — tente outro arquivo.";
        atualizarItem(id, { status: "erro", error: erro });
        persistirItem(id, { status: "erro", erro });
        return;
      }
      const blob = await upload(arquivo.name, arquivo, {
        access: "public",
        handleUploadUrl: "/api/blob-upload",
      });
      atualizarItem(id, { imageUrl: blob.url });
      persistirItem(id, { imageUrl: blob.url });
      await analisar(id, blob.url);
    } catch (err) {
      const erro = err instanceof Error ? err.message : "Falha no envio da imagem.";
      atualizarItem(id, { status: "erro", error: erro });
      persistirItem(id, { status: "erro", erro });
    }
  }

  async function processarFilaArquivos() {
    if (processando.current) return;
    processando.current = true;
    async function worker() {
      while (filaArquivos.current.length > 0) {
        const file = filaArquivos.current.shift();
        if (!file) break;
        await processarArquivo(file);
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    processando.current = false;
  }

  function enfileirarArquivos(lista: FileList | File[]) {
    const arquivos = Array.from(lista).filter((f) => f.type.startsWith("image/"));
    if (arquivos.length === 0) return;
    filaArquivos.current.push(...arquivos);
    void processarFilaArquivos();
  }

  async function analisarSite(item: QueueItem) {
    const website = edicaoDe(item).website.trim();
    if (!website) return;
    setAnalyses((s) => ({ ...s, [item.id]: { loading: true, result: null, error: null } }));
    try {
      const res = await fetch("/api/search/manual/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website }),
      });
      const data = (await res.json()) as { ok: boolean; analysis?: SiteAnalysis; error?: string };
      if (data.ok && data.analysis) {
        setAnalyses((s) => ({ ...s, [item.id]: { loading: false, result: data.analysis!, error: null } }));
      } else {
        setAnalyses((s) => ({
          ...s,
          [item.id]: { loading: false, result: null, error: data.error ?? "Falha ao analisar." },
        }));
      }
    } catch {
      setAnalyses((s) => ({
        ...s,
        [item.id]: { loading: false, result: null, error: "Erro de rede ao analisar." },
      }));
    }
  }

  async function enriquecer(item: QueueItem) {
    const e = edicaoDe(item);
    const website = e.website.trim();
    if (!website) return;
    setEnrichments((s) => ({ ...s, [item.id]: { loading: true, result: null, error: null } }));
    try {
      const res = await fetch("/api/search/manual/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website, country: e.country }),
      });
      const data = (await res.json()) as { ok: boolean; result?: EnrichResult; error?: string };
      if (data.ok && data.result) {
        const r = data.result;
        setEnrichments((s) => ({ ...s, [item.id]: { loading: false, result: r, error: null } }));
        const atual = edicaoDe(item);
        atualizarEdicao(item, {
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
          [item.id]: { loading: false, result: null, error: data.error ?? "Falha ao enriquecer." },
        }));
      }
    } catch {
      setEnrichments((s) => ({
        ...s,
        [item.id]: { loading: false, result: null, error: "Erro de rede ao enriquecer." },
      }));
    }
  }

  async function adicionar(item: QueueItem) {
    if (!item.candidate) return;
    setAddingId(item.id);
    setAddErrors((s) => ({ ...s, [item.id]: "" }));
    try {
      const c = item.candidate;
      const e = edicaoDe(item);
      const enr = enrichments[item.id]?.result;
      const enrichExtra = enr
        ? { taxId: enr.taxId, emailsAlt: enr.emails.slice(1), whatsappAlt: enr.whatsapps.slice(1) }
        : c.enrichExtra ?? undefined;
      const res = await fetch("/api/search/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate: c,
          country: e.country,
          overrides: e,
          analysis: analyses[item.id]?.result ?? c.analysis ?? undefined,
          enrichExtra,
          igProfile: c.instagramHandle
            ? {
                handle: c.instagramHandle,
                followersCount: c.instagramFollowers ?? null,
                mediaCount: c.instagramMediaCount ?? null,
                biography: c.instagramBio ?? null,
              }
            : undefined,
          source: "ia",
          adSummary: c.adSummary,
        }),
      });
      const data = (await res.json()) as { ok: boolean; lead?: { id: string }; error?: string };
      if (data.ok && data.lead) {
        atualizarItem(item.id, { addedLeadId: data.lead.id });
        persistirItem(item.id, { leadAdicionadoId: data.lead.id });
      } else {
        setAddErrors((s) => ({ ...s, [item.id]: data.error ?? "Falha ao adicionar." }));
      }
    } catch {
      setAddErrors((s) => ({ ...s, [item.id]: "Erro de rede ao adicionar." }));
    } finally {
      setAddingId(null);
    }
  }

  async function descartar(item: QueueItem) {
    setDiscardingId(item.id);
    atualizarFila((f) => f.filter((it) => it.id !== item.id));
    await fetch(`/api/ia/fila/${item.id}`, { method: "DELETE" }).catch(() => {});
    if (item.imageUrl) {
      try {
        await fetch("/api/ia/discard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: item.imageUrl }),
        });
      } catch {
        /* melhor esforço — o item já saiu da fila de qualquer forma */
      }
    }
    setDiscardingId(null);
  }

  async function limparTudo() {
    if (fila.length === 0) return;
    if (!confirm("Descartar todos os itens da fila? Não dá pra desfazer.")) return;
    const urls = fila.map((it) => it.imageUrl).filter(Boolean);
    atualizarFila(() => []);
    await fetch("/api/ia/fila?all=true", { method: "DELETE" }).catch(() => {});
    for (const url of urls) {
      fetch("/api/ia/discard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      }).catch(() => {});
    }
  }

  const pendentes = fila.filter((it) => it.status === "enviando" || it.status === "analisando").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
            <Sparkles className="h-3.5 w-3.5" />
            Anúncios
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
            IA
          </h1>
          <p className="mt-2 max-w-2xl text-[14.5px] text-zinc-400">
            Suba os prints de anúncios que você foi salvando — a IA identifica o anunciante e faz
            a varredura completa (site, Instagram e contatos). Você decide, um por um, o que vira
            lead no <span className="text-zinc-200">Leads</span> e no{" "}
            <span className="text-zinc-200">CRM</span>.
          </p>
        </div>
        {fila.length > 0 && (
          <button
            type="button"
            onClick={limparTudo}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/[0.09] px-4 py-2.5 text-[12.5px] font-semibold text-zinc-400 transition-colors hover:border-rose-400/40 hover:text-rose-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Limpar tudo
          </button>
        )}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) enfileirarArquivos(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragOver
            ? "border-volt/60 bg-volt/[0.06]"
            : "border-white/[0.09] bg-white/[0.02] hover:border-white/20"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) enfileirarArquivos(e.target.files);
            e.target.value = "";
          }}
        />
        <UploadCloud className="h-8 w-8 text-zinc-500" />
        <p className="text-[14px] font-semibold text-zinc-200">
          Toque para escolher os prints, ou arraste aqui
        </p>
        <p className="text-[12px] text-zinc-500">
          Pode escolher vários de uma vez — cada um vira um card assim que a IA terminar.
        </p>
        {pendentes > 0 && (
          <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-volt">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {pendentes} em processamento…
          </p>
        )}
      </div>

      {fila.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/[0.09] px-6 py-16 text-center">
          <ImagePlus className="h-8 w-8 text-zinc-600" />
          <p className="max-w-sm text-[14px] text-zinc-500">
            Nenhum print na fila ainda. Suba um anúncio que você salvou pra ver a IA em ação.
          </p>
        </div>
      )}

      {fila.length > 0 && (
        <div className="space-y-3">
          {fila.map((item) => {
            if (item.status === "enviando" || item.status === "analisando") {
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4"
                >
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL do Blob e dinamica, sem dominio fixo pra configurar em next/image
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-14 w-14 shrink-0 rounded-lg bg-white/[0.04]" />
                  )}
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-zinc-300">
                    <Loader2 className="h-4 w-4 animate-spin text-volt" />
                    {item.status === "enviando" ? "Enviando…" : "Analisando com IA…"}
                  </div>
                </div>
              );
            }

            if (item.status === "erro") {
              return (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-rose-400/25 bg-rose-400/[0.05] p-4"
                >
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL do Blob e dinamica, sem dominio fixo pra configurar em next/image
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-14 w-14 shrink-0 rounded-lg bg-white/[0.04]" />
                  )}
                  <p className="min-w-0 flex-1 text-[12.5px] text-rose-300">{item.error}</p>
                  <div className="flex shrink-0 items-center gap-2">
                    {item.imageUrl && (
                      <button
                        type="button"
                        onClick={() => analisar(item.id, item.imageUrl)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-[12px] font-semibold text-zinc-200 hover:border-volt/40 hover:text-volt"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Tentar de novo
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => descartar(item)}
                      disabled={discardingId === item.id}
                      className="shrink-0 rounded-full p-1.5 text-zinc-500 transition-colors hover:text-rose-300"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            }

            const c = item.candidate!;
            const leadId = item.addedLeadId ?? c.existingLeadId;
            const e = edicaoDe(item);
            const aberto = expanded[item.id] ?? false;
            const analise = analyses[item.id];
            const enriquecimento = enrichments[item.id];
            const confCor =
              c.confidence === "alta"
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                : c.confidence === "media"
                  ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
                  : "border-rose-400/30 bg-rose-400/10 text-rose-300";

            if (leadId) {
              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 md:flex-row md:items-center md:justify-between md:p-5"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL do Blob e dinamica, sem dominio fixo pra configurar em next/image */}
                    <img src={item.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 shrink-0 text-volt" />
                        <span className="truncate font-semibold text-zinc-100">{c.companyName}</span>
                      </div>
                    </div>
                  </div>
                  <Link
                    href={`/leads?lead=${leadId}`}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-volt/40 bg-volt/10 px-4 py-2.5 text-[12.5px] font-bold text-volt transition-colors hover:bg-volt/[0.16]"
                  >
                    {item.addedLeadId ? <Check className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}
                    {item.addedLeadId ? "Adicionado — ver lead" : "Já é um lead — abrir"}
                  </Link>
                </div>
              );
            }

            return (
              <div key={item.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 md:p-5">
                <div className="flex items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- URL do Blob e dinamica, sem dominio fixo pra configurar em next/image */}
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="h-16 w-16 shrink-0 cursor-pointer rounded-lg object-cover"
                    onClick={() => setExpanded((s) => ({ ...s, [item.id]: !aberto }))}
                  />
                  <button
                    type="button"
                    onClick={() => setExpanded((s) => ({ ...s, [item.id]: !aberto }))}
                    className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left"
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
                        <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${confCor}`}>
                          confiança {c.confidence}
                        </span>
                        {typeof c.instagramFollowers === "number" && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-fuchsia-400/25 bg-fuchsia-400/10 px-2 py-0.5 text-[10.5px] font-semibold text-fuchsia-300">
                            <AtSign className="h-3 w-3" />
                            {c.instagramFollowers.toLocaleString("pt-BR")} seguidores
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-[12px] text-zinc-500">{c.adSummary}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-zinc-500">
                        {c.phone && (
                          <span className="inline-flex items-center gap-1.5">
                            <Phone className="h-3 w-3 shrink-0" />
                            {formatPhone(c.phone, c.country)}
                          </span>
                        )}
                        {c.instagramHandle && (
                          <span className="inline-flex items-center gap-1.5">
                            <AtSign className="h-3 w-3 shrink-0" />@{c.instagramHandle}
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
                </div>

                {aberto && (
                  <div className="mt-4 space-y-3 border-t border-white/[0.06] pt-4">
                    <div className="inline-flex rounded-full border border-white/[0.09] bg-ink p-1">
                      {(["BR", "PT"] as const).map((pais) => (
                        <button
                          key={pais}
                          type="button"
                          onClick={() => atualizarEdicao(item, { country: pais })}
                          className={`rounded-full px-4 py-1.5 text-[11.5px] font-bold transition-all ${
                            e.country === pais ? "bg-volt text-onvolt" : "text-zinc-500 hover:text-zinc-200"
                          }`}
                        >
                          {pais === "BR" ? "Brasil" : "Portugal"}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <Campo label="Nome da empresa" value={e.companyName} onChange={(v) => atualizarEdicao(item, { companyName: v })} />
                      <Campo label="Responsável" value={e.ownerName} onChange={(v) => atualizarEdicao(item, { ownerName: v })} />
                      <Campo label="Segmento" value={e.segment} onChange={(v) => atualizarEdicao(item, { segment: v })} />
                      <Campo label="Telefone" value={e.phone} onChange={(v) => atualizarEdicao(item, { phone: v })} />
                      <Campo label="WhatsApp" value={e.whatsapp} onChange={(v) => atualizarEdicao(item, { whatsapp: v })} />
                      <Campo label="E-mail" value={e.email} onChange={(v) => atualizarEdicao(item, { email: v })} />
                      <Campo label="Site" value={e.website} onChange={(v) => atualizarEdicao(item, { website: v })} />
                      <Campo label="Instagram" value={e.instagram} onChange={(v) => atualizarEdicao(item, { instagram: v })} />
                      <Campo label="Facebook" value={e.facebook} onChange={(v) => atualizarEdicao(item, { facebook: v })} />
                      <Campo label="LinkedIn" value={e.linkedin} onChange={(v) => atualizarEdicao(item, { linkedin: v })} />
                    </div>
                    <div>
                      <label className="text-[11.5px] font-semibold text-zinc-500">Anotações</label>
                      <textarea
                        value={e.notes}
                        onChange={(ev) => atualizarEdicao(item, { notes: ev.target.value })}
                        rows={2}
                        placeholder="Opcional — some ao resumo do anúncio que a IA já escreveu."
                        className="mt-1 w-full rounded-lg border border-white/[0.09] bg-ink px-3 py-2 text-[12.5px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-volt/50"
                      />
                    </div>

                    {e.website && (
                      <div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => enriquecer(item)}
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
                            onClick={() => analisarSite(item)}
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
                        {(analise?.error || (!analise && !c.analysis)) && null}
                        {(analise?.result ?? c.analysis) && (
                          <div className="mt-2.5 rounded-lg border border-white/[0.07] bg-ink/60 p-3">
                            {(() => {
                              const res = (analise?.result ?? c.analysis)!;
                              return (
                                <>
                                  <div className="flex items-center gap-2 text-[12.5px] font-bold text-zinc-100">
                                    {res.grade === "modern" ? (
                                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                    ) : (
                                      <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />
                                    )}
                                    Nota {res.score}/100 —{" "}
                                    {res.grade === "modern"
                                      ? "moderno"
                                      : res.grade === "outdated"
                                        ? "desatualizado"
                                        : "crítico"}
                                  </div>
                                  <ul className="mt-2 space-y-1.5">
                                    {res.checks.map((chk) => (
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
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    )}

                    {addErrors[item.id] && (
                      <p className="text-[12px] text-rose-300">{addErrors[item.id]}</p>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => descartar(item)}
                        disabled={discardingId === item.id}
                        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-zinc-500 hover:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Descartar
                      </button>
                      <button
                        type="button"
                        onClick={() => adicionar(item)}
                        disabled={addingId === item.id}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-volt px-5 py-2.5 text-[12.5px] font-bold text-onvolt transition-transform hover:scale-[1.03] disabled:opacity-60"
                      >
                        {addingId === item.id ? (
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[11.5px] font-semibold text-zinc-500">{label}</label>
      <input
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
        className="mt-1 w-full rounded-lg border border-white/[0.09] bg-ink px-3 py-2 text-[12.5px] text-zinc-100 outline-none focus:border-volt/50"
      />
    </div>
  );
}
