"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bookmark,
  Check,
  CheckCircle2,
  Copy,
  Crosshair,
  ExternalLink,
  History,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Play,
  Plus,
  Terminal,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import {
  DORK_VAZIO,
  LIMITE_PALAVRAS,
  PLATAFORMAS,
  SUGESTOES_CONTATO,
  SUGESTOES_EMAIL,
  SUGESTOES_EMAIL_PT,
  NICHO_POR_SEGMENTO,
  SUGESTOES_EXCLUIR,
  contarPalavras,
  corrigirComando,
  montarDork,
  sugerirSinonimos,
  urlGoogle,
  validarDork,
  type DorkInput,
  type Pais,
} from "@/lib/dork";
import { CITY_PRESETS, SEGMENT_PRESETS } from "@/lib/constants";
import { SEGMENT_ICONS } from "@/lib/segment-icons";
import { timeAgo } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { temContato, type CandidatoComando } from "@/lib/dork-extract";

interface ComandoModelo {
  id: string;
  nome: string;
  input: DorkInput;
  usos: number;
  criadoEm: string;
  usadoEm: string | null;
}

interface EstadoBusca {
  comando: string;
  pagina: number;
  temMais: boolean;
  candidatos: CandidatoComando[];
  carregando: boolean;
  erro: string | null;
  /** A 1ª página veio do histórico (sem gastar consulta) — e de quando ela é. */
  doHistorico: boolean;
  buscadoEm: string | null;
  pais: Pais;
}

interface BuscaHistorico {
  id: string;
  comando: string;
  input: DorkInput | null;
  atualizadoEm: string;
  paginas: number;
  resultados: number;
  comContato: number;
}

/** "São Paulo, SP" → "São Paulo": no Google a sigla do estado atrapalha mais do que ajuda. */
function nomeDaCidade(label: string): string {
  return label.split(",")[0].trim();
}

function mesmosTermos(a: string[], b: string[]): boolean {
  const n = (l: string[]) => l.map((t) => t.toLowerCase()).sort().join("|");
  return a.length > 0 && n(a) === n(b);
}

/** Mesma normalização do servidor: espaços repetidos não fazem outra busca. */
function normalizarComando(c: string): string {
  return c.replace(/\s+/g, " ").trim();
}

function mesmoInput(a: DorkInput, b: DorkInput): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export default function ComandosPage() {
  const [input, setInput] = useState<DorkInput>(DORK_VAZIO);
  const [modelos, setModelos] = useState<ComandoModelo[] | null>(null);
  const [modeloAtivo, setModeloAtivo] = useState<ComandoModelo | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [nomeModelo, setNomeModelo] = useState<string | null>(null);
  const [erroModelo, setErroModelo] = useState<string | null>(null);
  const [busca, setBusca] = useState<EstadoBusca | null>(null);
  const [historico, setHistorico] = useState<BuscaHistorico[] | null>(null);

  const comando = useMemo(() => montarDork(input), [input]);
  const avisos = useMemo(() => validarDork(input, comando), [input, comando]);
  const palavras = contarPalavras(comando);
  const sinonimos = useMemo(() => sugerirSinonimos(input.nicho), [input.nicho]);

  const carregarModelos = useCallback(async () => {
    try {
      const res = await fetch("/api/comandos/modelos");
      const data = (await res.json()) as { ok: boolean; modelos?: ComandoModelo[] };
      setModelos(data.ok ? (data.modelos ?? []) : []);
    } catch {
      setModelos([]);
    }
  }, []);

  useEffect(() => {
    carregarModelos();
  }, [carregarModelos]);

  const carregarHistorico = useCallback(async () => {
    try {
      const res = await fetch("/api/comandos/historico");
      const data = (await res.json()) as { ok: boolean; buscas?: BuscaHistorico[] };
      setHistorico(data.ok ? (data.buscas ?? []) : []);
    } catch {
      setHistorico([]);
    }
  }, []);

  useEffect(() => {
    carregarHistorico();
  }, [carregarHistorico]);

  const jaBuscado = useMemo(() => {
    const n = normalizarComando(comando);
    return (
      historico?.find((h) => h.comando === n && (h.input?.pais ?? "BR") === input.pais) ?? null
    );
  }, [historico, comando, input.pais]);

  function set<K extends keyof DorkInput>(campo: K, valor: DorkInput[K]) {
    setInput((v) => ({ ...v, [campo]: valor }));
  }

  function togglePlataforma(id: string) {
    set(
      "plataformas",
      input.plataformas.includes(id)
        ? input.plataformas.filter((p) => p !== id)
        : [...input.plataformas, id],
    );
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(comando);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* navegador sem permissão de clipboard — o comando continua visível pra copiar à mão */
    }
  }

  function contarUsoModelo() {
    // Só conta uso se o comando é exatamente o do modelo (não editado depois).
    if (modeloAtivo && mesmoInput(modeloAtivo.input, input)) {
      fetch("/api/comandos/modelos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: modeloAtivo.id }),
      })
        .then(() => carregarModelos())
        .catch(() => undefined);
    }
  }

  function abrirNoGoogle() {
    window.open(urlGoogle(comando, input.pais), "_blank", "noopener,noreferrer");
    contarUsoModelo();
  }

  /** Página 1 começa uma busca nova; as seguintes somam na lista (sem repetir). */
  async function rodarBusca(
    pagina: number,
    opts: { comando?: string; forcar?: boolean; inputUsado?: DorkInput } = {},
  ) {
    const cmd = opts.comando ?? (pagina === 1 ? comando : (busca?.comando ?? comando));
    const inp = opts.inputUsado ?? input;
    if (!cmd) return;
    setBusca((b) =>
      pagina === 1 || !b
        ? {
            comando: cmd,
            pagina,
            temMais: false,
            candidatos: [],
            carregando: true,
            erro: null,
            doHistorico: false,
            buscadoEm: null,
            pais: inp.pais,
          }
        : { ...b, carregando: true, erro: null },
    );
    if (pagina === 1 && !opts.comando) contarUsoModelo();
    try {
      const res = await fetch("/api/comandos/buscar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: cmd,
          pagina,
          cidade: inp.cidade[0] ?? "",
          categoria: inp.nicho[0] ?? "",
          input: inp,
          forcar: !!opts.forcar,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        pagina?: number;
        temMais?: boolean;
        candidatos?: CandidatoComando[];
        doHistorico?: boolean;
        buscadoEm?: string;
      };
      if (!data.ok) throw new Error(data.error);
      carregarHistorico();
      setBusca((b) => {
        const anteriores = pagina === 1 ? [] : (b?.candidatos ?? []);
        const vistos = new Set(anteriores.map((c) => c.osmId));
        const novos = (data.candidatos ?? []).filter((c) => !vistos.has(c.osmId));
        return {
          comando: cmd,
          pagina,
          temMais: !!data.temMais,
          candidatos: [...anteriores, ...novos],
          carregando: false,
          erro: null,
          doHistorico: pagina === 1 ? !!data.doHistorico : (b?.doHistorico ?? false),
          buscadoEm: pagina === 1 ? (data.buscadoEm ?? null) : (b?.buscadoEm ?? null),
          pais: inp.pais,
        };
      });
    } catch (e) {
      setBusca((b) => ({
        comando: cmd,
        pagina: b?.pagina ?? 1,
        temMais: b?.temMais ?? false,
        candidatos: b?.candidatos ?? [],
        carregando: false,
        erro: (e as Error).message || "Erro de rede ao buscar.",
        doHistorico: b?.doHistorico ?? false,
        buscadoEm: b?.buscadoEm ?? null,
        pais: inp.pais,
      }));
    }
  }

  function abrirDoHistorico(h: BuscaHistorico) {
    const inp = h.input ? { ...DORK_VAZIO, ...h.input } : input;
    if (h.input) setInput(inp);
    setModeloAtivo(null);
    rodarBusca(1, { comando: h.comando, inputUsado: inp });
  }

  async function excluirDoHistorico(h: BuscaHistorico | null) {
    if (!window.confirm(h ? "Tirar esta busca do histórico?" : "Apagar todo o histórico de buscas?"))
      return;
    setHistorico((lista) => (h ? (lista?.filter((x) => x.id !== h.id) ?? null) : []));
    await fetch("/api/comandos/historico", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(h ? { id: h.id } : { tudo: true }),
    }).catch(() => undefined);
    carregarHistorico();
  }

  async function salvarModelo() {
    const nome = nomeModelo?.trim();
    if (!nome) return;
    setSalvando(true);
    setErroModelo(null);
    try {
      const res = await fetch("/api/comandos/modelos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, input }),
      });
      const data = (await res.json()) as { ok: boolean; modelo?: ComandoModelo; error?: string };
      if (!data.ok || !data.modelo) throw new Error(data.error);
      setModeloAtivo(data.modelo);
      setNomeModelo(null);
      await carregarModelos();
    } catch (e) {
      setErroModelo((e as Error).message || "Não foi possível salvar agora.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluirModelo(m: ComandoModelo) {
    if (!window.confirm(`Excluir o modelo "${m.nome}"?`)) return;
    setModelos((lista) => lista?.filter((x) => x.id !== m.id) ?? null);
    if (modeloAtivo?.id === m.id) setModeloAtivo(null);
    await fetch("/api/comandos/modelos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: m.id }),
    }).catch(() => undefined);
    carregarModelos();
  }

  function carregarModelo(m: ComandoModelo) {
    setInput({ ...DORK_VAZIO, ...m.input });
    setModeloAtivo(m);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
          <Terminal className="h-3.5 w-3.5" />
          Comandos
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
          Comandos de busca
        </h1>
        <p className="mt-2 text-[14.5px] text-zinc-400">
          Monte buscas avançadas no Google (dorks) pra achar leads com e-mail e contato público.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
        {/* Filtros */}
        <section className="space-y-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 md:p-6">
          <Campo
            label="Nicho"
            dica="Escolha um segmento pronto ou digite. Vários termos viram OR — qualquer um serve."
          >
            <div className="mb-3 flex flex-wrap gap-2">
              {SEGMENT_PRESETS.map((sg) => {
                const Icon = SEGMENT_ICONS[sg.key] ?? Crosshair;
                const termos = NICHO_POR_SEGMENTO[sg.key] ?? [sg.label];
                const ativo = mesmosTermos(input.nicho, termos);
                return (
                  <button
                    key={sg.key}
                    type="button"
                    onClick={() => set("nicho", ativo ? [] : termos)}
                    aria-pressed={ativo}
                    title={termos.join(" · ")}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                      ativo
                        ? "border-volt bg-volt text-onvolt"
                        : "border-white/[0.09] bg-white/[0.02] text-zinc-400 hover:border-volt/40 hover:text-zinc-100"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {sg.label}
                  </button>
                );
              })}
            </div>
            <TagField
              valores={input.nicho}
              onChange={(v) => set("nicho", v)}
              placeholder="ex.: advogado, dentista, clínica de estética"
              sugestoes={sinonimos}
              rotuloSugestoes="Sinônimos"
            />
          </Campo>

          <Campo label="Cidade" dica="Marque uma ou mais — várias cidades viram OR.">
            <div className="mb-3 inline-flex rounded-full border border-white/[0.09] bg-ink p-1">
              {(["BR", "PT"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    if (p === input.pais) return;
                    // Cidade e e-mails sugeridos são de um país só: trocar limpa os dois.
                    setInput((v) => ({ ...v, pais: p, cidade: [], emails: [] }));
                  }}
                  aria-pressed={input.pais === p}
                  className={`rounded-full px-4 py-1.5 text-[12px] font-bold transition-colors ${
                    input.pais === p ? "bg-volt text-onvolt" : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {p === "BR" ? "Brasil" : "Portugal"}
                </button>
              ))}
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {CITY_PRESETS.filter((c) => c.country === input.pais).map((c) => {
                const nome = nomeDaCidade(c.label);
                const ativo = input.cidade.some((x) => x.toLowerCase() === nome.toLowerCase());
                return (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() =>
                      set(
                        "cidade",
                        ativo
                          ? input.cidade.filter((x) => x.toLowerCase() !== nome.toLowerCase())
                          : [...input.cidade, nome],
                      )
                    }
                    aria-pressed={ativo}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                      ativo
                        ? "border-volt bg-volt text-onvolt"
                        : "border-white/[0.09] bg-white/[0.02] text-zinc-400 hover:border-volt/40 hover:text-zinc-100"
                    }`}
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    {c.label}
                  </button>
                );
              })}
            </div>
            <TagField
              valores={input.cidade}
              onChange={(v) => set("cidade", v)}
              placeholder={
                input.pais === "PT"
                  ? "Ou digite outra cidade… ex.: Setúbal"
                  : "Ou digite outra cidade… ex.: Apucarana"
              }
            />
          </Campo>

          <Campo label="Bairro / região" opcional>
            <TagField
              valores={input.regiao}
              onChange={(v) => set("regiao", v)}
              placeholder={input.pais === "PT" ? "ex.: Chiado, Baixa" : "ex.: Pinheiros, Zona Sul"}
            />
          </Campo>

          <Campo label="Plataforma" dica="Nenhuma marcada = qualquer site.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PLATAFORMAS.map((p) => {
                const on = input.plataformas.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePlataforma(p.id)}
                    aria-pressed={on}
                    className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      on
                        ? "border-volt/60 bg-volt/[0.08] ring-2 ring-volt/15"
                        : "border-white/[0.08] bg-ink/60 hover:border-white/20"
                    }`}
                  >
                    <span className={`block text-[12.5px] font-semibold ${on ? "text-volt" : "text-zinc-200"}`}>
                      {p.label}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[10.5px] text-zinc-500">
                      {p.operador}
                    </span>
                  </button>
                );
              })}
            </div>
          </Campo>

          <Campo label="E-mail no perfil" dica="Provedores que costumam aparecer na bio ou na página.">
            <TagField
              valores={input.emails}
              onChange={(v) => set("emails", v)}
              placeholder="ex.: @gmail.com ou @seudominio.com.br"
              sugestoes={input.pais === "PT" ? SUGESTOES_EMAIL_PT : SUGESTOES_EMAIL}
            />
          </Campo>

          <div className="grid gap-5 md:grid-cols-2">
            <Campo label="Sinais de contato" opcional>
              <TagField
                valores={input.contato}
                onChange={(v) => set("contato", v)}
                placeholder="ex.: wa.me"
                sugestoes={SUGESTOES_CONTATO}
              />
            </Campo>
            <Campo label="Excluir" opcional>
              <TagField
                valores={input.excluir}
                onChange={(v) => set("excluir", v)}
                placeholder="ex.: vaga"
                sugestoes={SUGESTOES_EXCLUIR}
                negativo
              />
            </Campo>
          </div>

          {!mesmoInput(input, DORK_VAZIO) && (
            <button
              type="button"
              onClick={() => {
                setInput(DORK_VAZIO);
                setModeloAtivo(null);
              }}
              className="text-[12px] font-semibold text-zinc-500 hover:text-zinc-200"
            >
              Limpar tudo
            </button>
          )}
        </section>

        {/* Comando + modelos — a coluna inteira acompanha a rolagem (no xl, lado
            a lado com os filtros). Fixar a coluna, e não só o card do comando,
            evita um card passar por cima dos outros. Se ela for mais alta que a
            tela, rola por dentro. */}
        <div className="space-y-5 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:self-start xl:overflow-y-auto xl:overscroll-contain xl:pr-1 [scrollbar-width:thin]">
          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 md:p-6">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500">
                Comando gerado
              </p>
              {modeloAtivo && (
                <span className="truncate text-[11px] text-zinc-500">
                  Modelo: <span className="text-zinc-300">{modeloAtivo.nome}</span>
                  {!mesmoInput(modeloAtivo.input, input) && " (editado)"}
                </span>
              )}
            </div>
            {/* Fundo escuro fixo nos dois temas — as cores do realce são pensadas pra ele. */}
            <div className="min-h-[88px] break-words rounded-xl border border-white/[0.08] bg-[#101014] p-4 font-mono text-[12.5px] leading-relaxed text-zinc-100">
              {comando ? (
                <ComandoRealcado comando={comando} />
              ) : (
                <span className="text-[#71717a]">Preencha os campos ao lado…</span>
              )}
            </div>

            <div className="mt-4 space-y-1.5">
              {avisos.map((a) => (
                <p
                  key={a.texto}
                  className={`flex items-start gap-1.5 text-[12px] ${
                    a.tipo === "ok" ? "text-volt" : "text-amber-300"
                  }`}
                >
                  {a.tipo === "ok" ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  )}
                  {a.texto}
                </p>
              ))}
              {comando && (
                <div className="pt-1">
                  <p className="text-[11.5px] text-zinc-500">
                    {palavras} de {LIMITE_PALAVRAS} palavras
                  </p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className={`h-full rounded-full ${palavras > LIMITE_PALAVRAS ? "bg-amber-400" : "bg-volt"}`}
                      style={{ width: `${Math.min(100, (palavras / LIMITE_PALAVRAS) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 grid grid-cols-[1.35fr_1fr_1fr] gap-2">
              <button
                type="button"
                onClick={abrirNoGoogle}
                disabled={!comando}
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-volt px-3 py-2.5 text-[12.5px] font-bold text-onvolt hover:bg-volt-dim disabled:opacity-40"
              >
                Abrir no Google <ExternalLink className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={copiar}
                disabled={!comando}
                className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/10 px-3 py-2.5 text-[12.5px] font-semibold text-zinc-300 hover:border-white/20 disabled:opacity-40"
              >
                {copiado ? <Check className="h-3.5 w-3.5 text-volt" /> : <Copy className="h-3.5 w-3.5" />}
                {copiado ? "Copiado" : "Copiar"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setErroModelo(null);
                  setNomeModelo(nomeModelo === null ? "" : null);
                }}
                disabled={!comando}
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 px-3 py-2.5 text-[12.5px] font-semibold text-zinc-300 hover:border-white/20 disabled:opacity-40"
              >
                <Bookmark className="h-3.5 w-3.5" /> Salvar
              </button>
            </div>

            <button
              type="button"
              onClick={() => rodarBusca(1)}
              disabled={!comando || busca?.carregando}
              className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-volt/40 bg-volt/[0.08] px-3 py-2.5 text-[12.5px] font-bold text-volt transition-colors hover:bg-volt/[0.14] disabled:opacity-40"
            >
              {busca?.carregando && busca.pagina === 1 && busca.candidatos.length === 0 ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Rodar aqui e extrair leads
            </button>
            <p className="mt-1.5 text-center text-[11px] text-zinc-600">
              {jaBuscado ? (
                <span className="text-volt">
                  Já buscado {timeAgo(jaBuscado.atualizadoEm)} — abre do histórico, sem custo
                </span>
              ) : (
                "Busca no Google via Serper · 1 consulta por página de 10 resultados"
              )}
            </p>

            {nomeModelo !== null && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  salvarModelo();
                }}
                className="mt-3 flex gap-2"
              >
                <input
                  autoFocus
                  value={nomeModelo}
                  onChange={(e) => setNomeModelo(e.target.value)}
                  placeholder="Nome do modelo, ex.: Advogados SP · Instagram"
                  maxLength={80}
                  className="min-w-0 flex-1 rounded-full border border-white/10 bg-ink/60 px-4 py-2 text-[12.5px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-volt/50"
                />
                <button
                  type="submit"
                  disabled={salvando || !nomeModelo.trim()}
                  className="inline-flex items-center gap-1.5 rounded-full bg-volt px-4 py-2 text-[12.5px] font-bold text-onvolt disabled:opacity-40"
                >
                  {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvar
                </button>
              </form>
            )}
            {erroModelo && <p className="mt-2 text-[12px] text-rose-300">{erroModelo}</p>}
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 md:p-6">
            <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500">
              Modelos salvos
            </p>
            {modelos === null ? (
              <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
            ) : modelos.length === 0 ? (
              <p className="text-[12.5px] text-zinc-500">
                Nenhum ainda. Monte um comando que funciona e clique em Salvar pra reaproveitar
                depois — os modelos ficam visíveis pra toda a equipe.
              </p>
            ) : (
              <div className="space-y-2">
                {modelos.map((m) => (
                  <div
                    key={m.id}
                    className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 ${
                      modeloAtivo?.id === m.id
                        ? "border-volt/40 bg-volt/[0.05]"
                        : "border-white/[0.07] bg-ink/60"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => carregarModelo(m)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-[12.5px] font-semibold text-zinc-100">
                        {m.nome}
                      </span>
                      <span className="block text-[11px] text-zinc-500">
                        {m.usos > 0
                          ? `usado ${m.usos}× · ${timeAgo(m.usadoEm ?? m.criadoEm)}`
                          : `salvo ${timeAgo(m.criadoEm)}`}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => carregarModelo(m)}
                      className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-zinc-400 hover:border-volt/40 hover:text-volt"
                    >
                      Abrir
                    </button>
                    <button
                      type="button"
                      onClick={() => excluirModelo(m)}
                      aria-label={`Excluir ${m.nome}`}
                      className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-rose-400/10 hover:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 md:p-6">
            <div className="mb-3 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500">
                <History className="h-3.5 w-3.5" /> Histórico de buscas
              </p>
              {!!historico?.length && (
                <button
                  type="button"
                  onClick={() => excluirDoHistorico(null)}
                  className="text-[11px] font-semibold text-zinc-500 hover:text-rose-300"
                >
                  Apagar tudo
                </button>
              )}
            </div>
            {historico === null ? (
              <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
            ) : historico.length === 0 ? (
              <p className="text-[12.5px] text-zinc-500">
                As buscas rodadas aqui ficam guardadas com os resultados. Reabrir uma delas não
                gasta consulta no Serper.
              </p>
            ) : (
              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {historico.map((h) => (
                  <div
                    key={h.id}
                    className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 ${
                      busca && normalizarComando(busca.comando) === h.comando
                        ? "border-volt/40 bg-volt/[0.05]"
                        : "border-white/[0.07] bg-ink/60"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => abrirDoHistorico(h)}
                      className="min-w-0 flex-1 text-left"
                      title={h.comando}
                    >
                      <span className="line-clamp-2 break-words font-mono text-[11.5px] leading-relaxed text-zinc-200">
                        {h.comando}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-zinc-500">
                        {h.resultados} resultado{h.resultados === 1 ? "" : "s"} ·{" "}
                        <span className="text-zinc-400">{h.comContato} com contato</span>
                        {h.paginas > 1 && ` · ${h.paginas} páginas`} · {timeAgo(h.atualizadoEm)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => abrirDoHistorico(h)}
                      className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-zinc-400 hover:border-volt/40 hover:text-volt"
                    >
                      Ver
                    </button>
                    <button
                      type="button"
                      onClick={() => excluirDoHistorico(h)}
                      aria-label="Tirar do histórico"
                      className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-rose-400/10 hover:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <CorretorDeComando />
        </div>
      </div>

      {busca && (
        <ResultadosBusca
          busca={busca}
          onCarregarMais={() => rodarBusca(busca.pagina + 1)}
          onBuscarDeNovo={() => rodarBusca(1, { comando: busca.comando, forcar: true })}
          paginasSalvas={
            historico?.find((h) => h.comando === normalizarComando(busca.comando))?.paginas ?? 0
          }
          onAtualizar={(osmId, leadId) =>
            setBusca((b) =>
              b
                ? {
                    ...b,
                    candidatos: b.candidatos.map((c) =>
                      c.osmId === osmId ? { ...c, existingLeadId: leadId } : c,
                    ),
                  }
                : b,
            )
          }
          onFechar={() => setBusca(null)}
        />
      )}
    </div>
  );
}

function ResultadosBusca({
  busca,
  onCarregarMais,
  onBuscarDeNovo,
  paginasSalvas,
  onAtualizar,
  onFechar,
}: {
  busca: EstadoBusca;
  onCarregarMais: () => void;
  onBuscarDeNovo: () => void;
  /** Quantas páginas deste comando já estão no histórico — as próximas até ali saem de graça. */
  paginasSalvas: number;
  onAtualizar: (osmId: string, leadId: string) => void;
  onFechar: () => void;
}) {
  const [soComContato, setSoComContato] = useState(true);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [adicionando, setAdicionando] = useState<Set<string>>(new Set());
  const [erros, setErros] = useState<Record<string, string>>({});
  const secaoRef = useRef<HTMLElement>(null);

  // A cada comando novo, rola até aqui — no celular os resultados ficam lá
  // embaixo, depois de modelos salvos e do corretor.
  // Espera a 1ª página chegar: com só o spinner a página ainda é curta
  // demais pra rolar até lá.
  const primeiraPaginaPronta = busca.pagina === 1 && !busca.carregando;
  useEffect(() => {
    if (primeiraPaginaPronta)
      secaoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [busca.comando, primeiraPaginaPronta]);

  const comContato = busca.candidatos.filter(temContato).length;
  const visiveis = soComContato ? busca.candidatos.filter(temContato) : busca.candidatos;
  const selecionaveis = visiveis.filter((c) => !c.existingLeadId);
  const marcados = selecionaveis.filter((c) => selecionados.has(c.osmId));

  function alternar(osmId: string) {
    setSelecionados((s) => {
      const n = new Set(s);
      if (n.has(osmId)) n.delete(osmId);
      else n.add(osmId);
      return n;
    });
  }

  async function adicionar(c: CandidatoComando) {
    setAdicionando((s) => new Set(s).add(c.osmId));
    setErros((er) => {
      const n = { ...er };
      delete n[c.osmId];
      return n;
    });
    try {
      const res = await fetch("/api/search/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate: c,
          country: busca.pais,
          source: "comandos",
          enrichExtra: c.emails.length > 1 ? { emailsAlt: c.emails.slice(1) } : undefined,
        }),
      });
      const data = (await res.json()) as { ok: boolean; lead?: { id: string }; error?: string };
      if (!data.ok || !data.lead) throw new Error(data.error);
      onAtualizar(c.osmId, data.lead.id);
      setSelecionados((s) => {
        const n = new Set(s);
        n.delete(c.osmId);
        return n;
      });
    } catch (e) {
      setErros((er) => ({ ...er, [c.osmId]: (e as Error).message || "Falha ao adicionar." }));
    } finally {
      setAdicionando((s) => {
        const n = new Set(s);
        n.delete(c.osmId);
        return n;
      });
    }
  }

  async function adicionarMarcados() {
    // Um de cada vez: cada lead cria uma busca "Comandos" própria no banco, e
    // em paralelo elas brigariam pela mesma linha em caso de lead repetido.
    for (const c of marcados) await adicionar(c);
  }

  return (
    <section
      ref={secaoRef}
      className="scroll-mt-20 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 md:p-6"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500">
            Resultados
          </p>
          <p className="mt-0.5 text-[12.5px] text-zinc-400">
            {busca.candidatos.length} resultado{busca.candidatos.length === 1 ? "" : "s"} ·{" "}
            <span className="text-zinc-200">{comContato} com contato</span> na prévia do Google
          </p>
          {busca.doHistorico && busca.buscadoEm && !busca.carregando && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-zinc-500">
              <span className="inline-flex items-center gap-1 rounded-full border border-volt/30 bg-volt/[0.06] px-2 py-0.5 font-semibold text-volt">
                <History className="h-3 w-3" /> Do histórico · sem custo
              </span>
              buscado {timeAgo(busca.buscadoEm)}.
              <button
                type="button"
                onClick={onBuscarDeNovo}
                className="font-semibold text-zinc-300 underline-offset-2 hover:text-volt hover:underline"
              >
                Buscar de novo (1 consulta)
              </button>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] text-zinc-400">
            <input
              type="checkbox"
              checked={soComContato}
              onChange={(e) => setSoComContato(e.target.checked)}
              className="accent-[var(--color-volt)]"
            />
            Só com contato
          </label>
          {selecionaveis.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setSelecionados(
                  marcados.length === selecionaveis.length
                    ? new Set()
                    : new Set(selecionaveis.map((c) => c.osmId)),
                )
              }
              className="rounded-full border border-white/10 px-3 py-1.5 text-[11.5px] font-semibold text-zinc-300 hover:border-white/20"
            >
              {marcados.length === selecionaveis.length ? "Desmarcar todos" : "Marcar todos"}
            </button>
          )}
          <button
            type="button"
            onClick={adicionarMarcados}
            disabled={marcados.length === 0 || adicionando.size > 0}
            className="inline-flex items-center gap-1.5 rounded-full bg-volt px-3.5 py-1.5 text-[11.5px] font-bold text-onvolt hover:bg-volt-dim disabled:opacity-40"
          >
            {adicionando.size > 0 ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            Adicionar {marcados.length > 0 ? marcados.length : ""} aos Leads
          </button>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar resultados"
            className="rounded-full p-1.5 text-zinc-500 hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {busca.erro && (
        <p className="mb-3 flex items-start gap-1.5 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-3.5 py-2.5 text-[12.5px] text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {busca.erro}
        </p>
      )}

      {busca.carregando && busca.candidatos.length === 0 ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-volt" />
        </div>
      ) : visiveis.length === 0 && !busca.erro ? (
        <p className="py-6 text-center text-[12.5px] text-zinc-500">
          {busca.candidatos.length === 0
            ? "O Google não achou nada com esse comando. Tente tirar alguns filtros."
            : "Nenhum resultado mostra contato na prévia. Desmarque “Só com contato” pra ver todos."}
        </p>
      ) : (
        <div className="space-y-2">
          {visiveis.map((c) => {
            const jaLead = !!c.existingLeadId;
            const carregando = adicionando.has(c.osmId);
            return (
              <div
                key={c.osmId}
                className={`flex gap-3 rounded-xl border px-3.5 py-3 ${
                  selecionados.has(c.osmId) && !jaLead
                    ? "border-volt/40 bg-volt/[0.04]"
                    : "border-white/[0.07] bg-ink/60"
                }`}
              >
                <input
                  type="checkbox"
                  checked={jaLead || selecionados.has(c.osmId)}
                  disabled={jaLead}
                  onChange={() => alternar(c.osmId)}
                  aria-label={`Selecionar ${c.companyName}`}
                  className="mt-1 accent-[var(--color-volt)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[13px] font-semibold text-zinc-100">{c.companyName}</span>
                    <a
                      href={c.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-full items-center gap-1 truncate text-[11px] text-zinc-500 hover:text-volt"
                    >
                      {c.link.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)}
                      <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                    </a>
                  </div>
                  {c.snippet && (
                    <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-zinc-500">
                      {c.snippet}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {c.emails.map((e) => (
                      <Dado key={e} icon={Mail}>{e}</Dado>
                    ))}
                    {c.whatsapp && <Dado icon={MessageCircle}>{formatPhone(c.whatsapp, busca.pais)}</Dado>}
                    {c.phone && !c.whatsapp?.endsWith(c.phone) && (
                      <Dado icon={Phone}>{formatPhone(c.phone, busca.pais)}</Dado>
                    )}
                    {c.instagramHandle && <Dado>@{c.instagramHandle}</Dado>}
                  </div>
                  {erros[c.osmId] && (
                    <p className="mt-1 text-[11.5px] text-rose-300">{erros[c.osmId]}</p>
                  )}
                </div>
                <div className="shrink-0 self-center">
                  {jaLead ? (
                    <a
                      href={`/leads?lead=${c.existingLeadId}`}
                      className="inline-flex items-center gap-1 rounded-full border border-volt/30 px-2.5 py-1 text-[11px] font-semibold text-volt hover:bg-volt/10"
                    >
                      <Check className="h-3 w-3" /> Já é lead
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => adicionar(c)}
                      disabled={carregando}
                      className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 hover:border-volt/40 hover:text-volt disabled:opacity-50"
                    >
                      {carregando ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Plus className="h-3 w-3" />
                      )}
                      Adicionar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {busca.temMais && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={onCarregarMais}
            disabled={busca.carregando}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-4 py-2 text-[12px] font-semibold text-zinc-300 hover:border-white/20 disabled:opacity-50"
          >
            {busca.carregando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Carregar mais (página {busca.pagina + 1} ·{" "}
            {busca.pagina + 1 <= paginasSalvas ? "do histórico" : "+1 consulta"})
          </button>
        </div>
      )}
    </section>
  );
}

function Dado({
  icon: Icon,
  children,
}: {
  icon?: typeof Mail;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[11px] font-medium text-zinc-300">
      {Icon && <Icon className="h-3 w-3 text-zinc-500" />}
      {children}
    </span>
  );
}

function Campo({
  label,
  dica,
  opcional,
  children,
}: {
  label: string;
  dica?: string;
  opcional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
        {opcional && <span className="text-[11px] text-zinc-600">opcional</span>}
      </div>
      {children}
      {dica && <p className="mt-1.5 text-[11px] text-zinc-600">{dica}</p>}
    </div>
  );
}

/**
 * Campo de etiquetas: Enter ou vírgula adiciona, × remove, Backspace no
 * campo vazio apaga a última. Sugestões aparecem embaixo e entram com um
 * clique. Colar "a, b, c" adiciona as três.
 */
function TagField({
  valores,
  onChange,
  placeholder,
  sugestoes = [],
  rotuloSugestoes,
  negativo,
}: {
  valores: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  sugestoes?: string[];
  rotuloSugestoes?: string;
  negativo?: boolean;
}) {
  const [texto, setTexto] = useState("");

  function adicionar(bruto: string) {
    const novos = bruto
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t && !valores.some((v) => v.toLowerCase() === t.toLowerCase()));
    if (novos.length) onChange([...valores, ...novos]);
    setTexto("");
  }

  const pendentes = sugestoes.filter(
    (s) => !valores.some((v) => v.toLowerCase() === s.toLowerCase()),
  );
  const corChip = negativo
    ? "border-rose-400/25 bg-rose-400/[0.08] text-rose-300"
    : "border-volt/30 bg-volt/[0.08] text-volt";

  return (
    <div>
      <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-xl border border-white/[0.08] bg-ink/60 px-2.5 py-1.5 focus-within:border-volt/40">
        {valores.map((v) => (
          <span
            key={v}
            className={`inline-flex items-center gap-1 rounded-full border py-0.5 pl-2.5 pr-1 text-[12px] font-semibold ${corChip}`}
          >
            {negativo && "−"}
            {v}
            <button
              type="button"
              onClick={() => onChange(valores.filter((x) => x !== v))}
              aria-label={`Remover ${v}`}
              className="rounded-full p-0.5 opacity-60 hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={texto}
          onChange={(e) => {
            const v = e.target.value;
            if (v.endsWith(",")) adicionar(v);
            else setTexto(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              adicionar(texto);
            } else if (e.key === "Backspace" && !texto && valores.length) {
              onChange(valores.slice(0, -1));
            }
          }}
          onBlur={() => texto.trim() && adicionar(texto)}
          placeholder={valores.length ? "" : placeholder}
          className="min-w-[120px] flex-1 bg-transparent py-1 text-[12.5px] text-zinc-100 outline-none placeholder:text-zinc-600"
        />
      </div>
      {pendentes.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {rotuloSugestoes && (
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
              <Wand2 className="h-3 w-3" /> {rotuloSugestoes}:
            </span>
          )}
          {pendentes.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange([...valores, s])}
              className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] px-2.5 py-0.5 text-[12px] text-zinc-400 transition-colors hover:border-volt/40 hover:text-volt"
            >
              <Plus className="h-3 w-3" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Realce simples: operadores, grupos, e-mails/frases e exclusões com cores diferentes. */
function ComandoRealcado({ comando }: { comando: string }) {
  const partes = comando.match(/"[^"]*"|\(|\)|\s+|[^\s()"]+/g) ?? [];
  return (
    <>
      {partes.map((p, i) => {
        let cor = "text-[#d1f64b]";
        if (/^\s+$/.test(p)) return p;
        if (p === "(" || p === ")") cor = "text-[#71717a]";
        else if (p === "OR") cor = "font-bold text-[#f0abfc]";
        else if (p.startsWith("-")) cor = "text-[#fda4af]";
        else if (p.startsWith("site:")) cor = "text-[#e4e4e7]";
        else if (p.startsWith('"@') || p.startsWith('"wa.')) cor = "text-[#93c5fd]";
        return (
          <span key={i} className={cor}>
            {p}
          </span>
        );
      })}
    </>
  );
}

/** Cola um comando escrito à mão e devolve corrigido, com a lista do que mudou. */
function CorretorDeComando() {
  const [bruto, setBruto] = useState("");
  const resultado = useMemo(() => (bruto.trim() ? corrigirComando(bruto) : null), [bruto]);
  const [copiado, setCopiado] = useState(false);

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 md:p-6">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500">
        Corrigir um comando pronto
      </p>
      <p className="mt-1 text-[12px] text-zinc-500">
        Cole um comando que você já usa: conserto aspas curvas, AND, parênteses e aspas sem fechar.
      </p>
      <textarea
        value={bruto}
        onChange={(e) => setBruto(e.target.value)}
        rows={3}
        placeholder='ex.: Advogado ("@gmail.com" OR "@hotmail.com" AND São Paulo site:instagram.com'
        className="mt-3 w-full resize-y rounded-xl border border-white/[0.08] bg-ink/60 px-3.5 py-2.5 font-mono text-[12px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-volt/40"
      />
      {resultado && (
        <div className="mt-3 space-y-2">
          {resultado.correcoes.length === 0 ? (
            <p className="flex items-center gap-1.5 text-[12px] text-volt">
              <CheckCircle2 className="h-3.5 w-3.5" /> Nada pra corrigir.
            </p>
          ) : (
            <>
              <div className="break-words rounded-xl border border-white/[0.08] bg-[#101014] p-3.5 font-mono text-[12px] leading-relaxed text-zinc-100">
                <ComandoRealcado comando={resultado.texto} />
              </div>
              <ul className="space-y-1">
                {resultado.correcoes.map((c) => (
                  <li key={c} className="flex items-start gap-1.5 text-[11.5px] text-zinc-400">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-volt" /> {c}
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="flex gap-2">
            <a
              href={urlGoogle(resultado.texto)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-volt px-3.5 py-2 text-[12px] font-bold text-onvolt hover:bg-volt-dim"
            >
              Abrir no Google <ExternalLink className="h-3 w-3" />
            </a>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(resultado.texto);
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 1500);
                } catch {
                  /* sem permissão de clipboard */
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-2 text-[12px] font-semibold text-zinc-300 hover:border-white/20"
            >
              {copiado ? <Check className="h-3 w-3 text-volt" /> : <Copy className="h-3 w-3" />}
              {copiado ? "Copiado" : "Copiar"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
