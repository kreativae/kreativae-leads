"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bookmark,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
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
  SUGESTOES_EXCLUIR,
  contarPalavras,
  corrigirComando,
  montarDork,
  sugerirSinonimos,
  urlGoogle,
  validarDork,
  type DorkInput,
} from "@/lib/dork";
import { timeAgo } from "@/lib/format";

interface ComandoModelo {
  id: string;
  nome: string;
  input: DorkInput;
  usos: number;
  criadoEm: string;
  usadoEm: string | null;
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

  function abrirNoGoogle() {
    window.open(urlGoogle(comando), "_blank", "noopener,noreferrer");
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
            dica="Profissão ou tipo de negócio. Vários termos viram OR — qualquer um serve."
          >
            <TagField
              valores={input.nicho}
              onChange={(v) => set("nicho", v)}
              placeholder="ex.: advogado, dentista, clínica de estética"
              sugestoes={sinonimos}
              rotuloSugestoes="Sinônimos"
            />
          </Campo>

          <div className="grid gap-5 md:grid-cols-2">
            <Campo label="Cidade" dica="Várias cidades viram OR.">
              <TagField
                valores={input.cidade}
                onChange={(v) => set("cidade", v)}
                placeholder="ex.: São Paulo"
              />
            </Campo>
            <Campo label="Bairro / região" opcional>
              <TagField
                valores={input.regiao}
                onChange={(v) => set("regiao", v)}
                placeholder="ex.: Pinheiros, Zona Sul"
              />
            </Campo>
          </div>

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
              sugestoes={SUGESTOES_EMAIL}
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

        {/* Comando + modelos */}
        <div className="space-y-5">
          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 md:p-6 xl:sticky xl:top-6">
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

          <CorretorDeComando />
        </div>
      </div>
    </div>
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
