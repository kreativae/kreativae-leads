/**
 * Montador de comandos de busca avançada do Google ("dorks") pra achar
 * leads com contato público. Tudo aqui é puro (sem banco, sem fetch) — a
 * aba Comandos chama no navegador a cada tecla, e os testes cobrem direto.
 */

export interface Plataforma {
  id: string;
  label: string;
  /** Operador que entra no comando — sempre um site: por enquanto. */
  operador: string;
}

export const PLATAFORMAS: Plataforma[] = [
  { id: "instagram", label: "Instagram", operador: "site:instagram.com" },
  { id: "linkedin", label: "LinkedIn", operador: "site:linkedin.com/in" },
  { id: "facebook", label: "Facebook", operador: "site:facebook.com" },
  { id: "linktree", label: "Linktree", operador: "site:linktr.ee" },
  { id: "wix", label: "Site Wix", operador: "site:wixsite.com" },
  { id: "wordpress", label: "WordPress.com", operador: "site:wordpress.com" },
  { id: "doctoralia", label: "Doctoralia", operador: "site:doctoralia.com.br" },
  { id: "jusbrasil", label: "Jusbrasil", operador: "site:jusbrasil.com.br" },
];

export const SUGESTOES_EMAIL = [
  "@gmail.com",
  "@hotmail.com",
  "@icloud.com",
  "@outlook.com",
  "@yahoo.com.br",
  "@uol.com.br",
];

export const SUGESTOES_CONTATO = ["wa.me", "WhatsApp", "api.whatsapp.com"];

export const SUGESTOES_EXCLUIR = ["vaga", "emprego", "curso", "estágio", "concurso"];

/** Sinônimos pra acelerar o campo Nicho — só sugestões, a pessoa escolhe. */
const SINONIMOS: Record<string, string[]> = {
  advogado: ["advogada", "advocacia", "escritório de advocacia"],
  dentista: ["odontologia", "clínica odontológica", "cirurgião-dentista"],
  psicologo: ["psicóloga", "psicologia", "terapeuta"],
  nutricionista: ["nutrição", "nutri"],
  fisioterapeuta: ["fisioterapia", "clínica de fisioterapia"],
  contador: ["contadora", "contabilidade", "escritório de contabilidade"],
  arquiteto: ["arquiteta", "arquitetura", "escritório de arquitetura"],
  medico: ["médica", "clínica médica", "consultório"],
  esteticista: ["estética", "clínica de estética", "harmonização facial"],
  corretor: ["corretora de imóveis", "imobiliária", "corretor de imóveis"],
  personal: ["personal trainer", "educador físico"],
  fotografo: ["fotógrafa", "fotografia"],
  veterinario: ["veterinária", "clínica veterinária", "pet shop"],
  cabeleireiro: ["cabeleireira", "salão de beleza", "hair stylist"],
};

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function sugerirSinonimos(nicho: string[]): string[] {
  const ja = new Set(nicho.map(semAcento));
  const out: string[] = [];
  for (const termo of nicho) {
    const lista = SINONIMOS[semAcento(termo).trim()];
    if (!lista) continue;
    for (const s of lista) if (!ja.has(semAcento(s)) && !out.includes(s)) out.push(s);
  }
  return out;
}

export interface DorkInput {
  nicho: string[];
  cidade: string[];
  regiao: string[];
  plataformas: string[];
  emails: string[];
  contato: string[];
  excluir: string[];
}

export const DORK_VAZIO: DorkInput = {
  nicho: [],
  cidade: [],
  regiao: [],
  plataformas: [],
  emails: [],
  contato: [],
  excluir: [],
};

/** Limite de palavras que o Google considera — o que passar disso é ignorado sem aviso. */
export const LIMITE_PALAVRAS = 32;

/** Aspas curvas/tipográficas (coladas do Word, WhatsApp, Notes) viram retas. */
export function normalizarAspas(s: string): string {
  return s.replace(/[“”„‟″«»]/g, '"').replace(/[‘’‚‛′]/g, "'");
}

function limparTermo(s: string): string {
  return normalizarAspas(s).replace(/"/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Aspas quando o termo tem espaço (frase exata) ou é e-mail/domínio (o
 * Google quebraria "@gmail.com" em pedaços sem elas). Palavra simples fica
 * sem aspas de propósito: assim o Google aceita plural e variações.
 */
function citar(termo: string): string {
  return /[\s@.]/.test(termo) ? `"${termo}"` : termo;
}

function grupoOr(termos: string[]): string | null {
  const limpos = termos.map(limparTermo).filter(Boolean);
  if (limpos.length === 0) return null;
  const partes = limpos.map(citar);
  return partes.length === 1 ? partes[0] : `(${partes.join(" OR ")})`;
}

export function montarDork(input: DorkInput): string {
  const partes: (string | null)[] = [
    grupoOr(input.nicho),
    grupoOr(input.emails),
    grupoOr(input.contato),
    grupoOr(input.cidade),
    grupoOr(input.regiao),
  ];
  const sites = PLATAFORMAS.filter((p) => input.plataformas.includes(p.id)).map((p) => p.operador);
  if (sites.length === 1) partes.push(sites[0]);
  else if (sites.length > 1) partes.push(`(${sites.join(" OR ")})`);
  for (const e of input.excluir.map(limparTermo).filter(Boolean)) partes.push(`-${citar(e)}`);
  return partes.filter(Boolean).join(" ");
}

/**
 * Conta aproximada de palavras como o Google conta: cada palavra dentro de
 * aspas conta, um operador site:x conta uma, OR e parênteses não contam.
 */
export function contarPalavras(comando: string): number {
  return comando
    .replace(/[()"]/g, " ")
    .split(/\s+/)
    .filter((t) => t && t !== "OR" && t !== "-")
    .length;
}

export interface Aviso {
  tipo: "ok" | "aviso";
  texto: string;
}

export function validarDork(input: DorkInput, comando: string): Aviso[] {
  const avisos: Aviso[] = [];
  if (input.nicho.filter((t) => limparTermo(t)).length === 0)
    avisos.push({ tipo: "aviso", texto: "Adicione pelo menos um nicho — sem ele a busca fica genérica demais." });
  const brutos = Object.values(input).flat();
  if (brutos.some((t) => /[“”„‟″«»‘’]/.test(t)))
    avisos.push({ tipo: "aviso", texto: "Aspas curvas “ ” foram trocadas por aspas retas." });
  const palavras = contarPalavras(comando);
  if (palavras > LIMITE_PALAVRAS)
    avisos.push({
      tipo: "aviso",
      texto: `${palavras} palavras: o Google só considera as primeiras ${LIMITE_PALAVRAS} e ignora o resto. Tire alguns termos.`,
    });
  if (input.emails.length > 0 && input.plataformas.includes("linkedin"))
    avisos.push({
      tipo: "aviso",
      texto: "O LinkedIn quase nunca mostra e-mail na prévia do Google — pode vir pouco resultado.",
    });
  if (comando && !avisos.some((a) => a.tipo === "aviso"))
    avisos.push({ tipo: "ok", texto: "Parênteses, aspas e operadores corretos." });
  return avisos;
}

/**
 * Conserta um comando escrito à mão/colado: aspas curvas, AND (que o Google
 * não entende — trata como palavra), "or" minúsculo, aspas e parênteses sem
 * fechar.
 */
export function corrigirComando(bruto: string): { texto: string; correcoes: string[] } {
  const correcoes: string[] = [];
  let s = bruto;

  const semCurvas = normalizarAspas(s);
  if (semCurvas !== s) correcoes.push("Aspas curvas trocadas por aspas retas.");
  s = semCurvas;

  // Só fora de aspas: dentro de uma frase exata "and"/"or" são texto de verdade.
  let tirouAnd = false;
  let consertouOr = false;
  s = s
    .split(/("[^"]*")/)
    .map((trecho) => {
      if (trecho.startsWith('"') && trecho.endsWith('"') && trecho.length > 1) return trecho;
      return trecho
        .replace(/(^|\s)(AND|&&)(?=\s|$)/g, (_m, pre) => {
          tirouAnd = true;
          return pre;
        })
        .replace(/(^|\s)(or|Or|\|\|)(?=\s|$)/g, (_m, pre) => {
          consertouOr = true;
          return `${pre}OR`;
        });
    })
    .join("");
  if (tirouAnd) correcoes.push("AND removido: o Google já combina todos os termos sozinho.");
  if (consertouOr) correcoes.push("\"or\" em minúsculas virou OR (o Google só reconhece em maiúsculas).");

  if ((s.match(/"/g) ?? []).length % 2 === 1) {
    s += '"';
    correcoes.push("Aspas sem fechar — fechei no final.");
  }

  const abertos: number[] = [];
  let saida = "";
  let dentroAspas = false;
  let removeuFecha = false;
  for (const ch of s) {
    if (ch === '"') dentroAspas = !dentroAspas;
    if (!dentroAspas && ch === "(") abertos.push(saida.length);
    if (!dentroAspas && ch === ")") {
      if (abertos.length === 0) {
        removeuFecha = true;
        continue;
      }
      abertos.pop();
    }
    saida += ch;
  }
  if (removeuFecha) correcoes.push("Parêntese fechando sem abrir — removido.");
  if (abertos.length > 0) {
    // Fecha cada grupo logo depois do termo que vem após o último OR dele —
    // em `a ("x" OR "y" São Paulo site:...` a pessoa quis fechar depois de
    // "y", não no fim (o que jogaria São Paulo pra dentro do OR).
    for (const inicio of abertos.reverse()) {
      const resto = saida.slice(inicio);
      const ultimoOr = resto.lastIndexOf(" OR ");
      let fim = saida.length;
      if (ultimoOr >= 0) {
        const depois = resto.slice(ultimoOr + 4);
        const termo = depois.match(/^\s*("[^"]*"|[^\s()]+)/);
        if (termo) fim = inicio + ultimoOr + 4 + termo[0].length;
      }
      saida = saida.slice(0, fim) + ")" + saida.slice(fim);
    }
    correcoes.push(
      `${abertos.length === 1 ? "Parêntese sem fechar" : `${abertos.length} parênteses sem fechar`} — fechei.`,
    );
  }

  s = saida.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();
  return { texto: s, correcoes };
}

export function urlGoogle(comando: string): string {
  return `https://www.google.com.br/search?q=${encodeURIComponent(comando)}`;
}
