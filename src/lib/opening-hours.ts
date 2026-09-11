/**
 * Le "esta aberto agora" a partir do texto de horarios do lead. Dois
 * formatos convivem no mesmo campo, dependendo de quem capturou o lead:
 *
 *  - OSM: sintaxe propria, em ingles — "Mo-Fr 08:00-18:00; Sa 08:00-12:00".
 *  - Google Places (pt-BR/pt-PT): dias por extenso, juntados com " · " —
 *    "segunda-feira: 08:00 – 18:00 · terça-feira: Fechado · ...".
 *
 * So um SUBCONJUNTO comum de cada sintaxe e interpretado. O que nao bate
 * com nenhum padrao reconhecido devolve null — nunca chuta um "Fechado"
 * errado; a tela so deixa de mostrar o selo e mantem o texto cru.
 */

interface Intervalo {
  inicio: number; // minutos desde meia-noite
  /** Pode passar de 1440: representa o horario avançando para o dia seguinte. */
  fim: number;
}

type Semana = Intervalo[][]; // indice 0 = domingo, igual ao Date.getDay()

const FUSO: Record<string, string> = {
  BR: "America/Sao_Paulo",
  PT: "Europe/Lisbon",
};

const DIAS_OSM: Record<string, number> = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6 };

const DIAS_PT: Record<string, number> = {
  domingo: 0,
  "segunda-feira": 1,
  segunda: 1,
  "terça-feira": 2,
  "terca-feira": 2,
  terça: 2,
  terca: 2,
  "quarta-feira": 3,
  quarta: 3,
  "quinta-feira": 4,
  quinta: 4,
  "sexta-feira": 5,
  sexta: 5,
  sábado: 6,
  sabado: 6,
};

function novaSemana(): Semana {
  return [[], [], [], [], [], [], []];
}

function parseIntervalo(txt: string): Intervalo | null {
  const m = txt.trim().match(/^(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const inicio = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  let fim = parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
  if (fim <= inicio) fim += 24 * 60; // passa da meia-noite
  return { inicio, fim };
}

function tituloCaso(dia: string): string {
  return dia[0].toUpperCase() + dia.slice(1).toLowerCase();
}

/** Sintaxe OSM. So o subconjunto usado na pratica: dias, horarios, "off" e "24/7". */
function parseOsm(texto: string): Semana | null {
  const limpo = texto.replace(/"[^"]*"/g, "").trim();
  if (!limpo) return null;
  const semana = novaSemana();
  const regras = limpo.split(";").map((r) => r.trim()).filter(Boolean);
  let alguma = false;

  for (const regra of regras) {
    if (/^24\/7$/i.test(regra)) {
      for (let d = 0; d < 7; d++) semana[d] = [{ inicio: 0, fim: 24 * 60 }];
      alguma = true;
      continue;
    }
    const partes = regra.split(/\s+/);
    let i = 0;
    while (i < partes.length && !/\d{1,2}:\d{2}/.test(partes[i]) && !/^(off|closed)$/i.test(partes[i])) i++;
    const diasTxt = partes.slice(0, i).join("");
    const restoTxt = partes.slice(i).join(" ");
    if (!diasTxt) continue;

    const dias = new Set<number>();
    for (const grupo of diasTxt.split(",")) {
      const m = grupo.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/i);
      if (!m) continue;
      const a = DIAS_OSM[tituloCaso(m[1])];
      const b = m[2] ? DIAS_OSM[tituloCaso(m[2])] : a;
      if (a === undefined || b === undefined) continue;
      for (let d = a; ; d = (d + 1) % 7) {
        dias.add(d);
        if (d === b) break;
      }
    }
    if (dias.size === 0) continue;

    if (/^(off|closed)$/i.test(restoTxt)) {
      for (const d of dias) semana[d] = [];
      alguma = true;
      continue;
    }
    const intervalos = restoTxt
      .split(",")
      .map(parseIntervalo)
      .filter((x): x is Intervalo => x !== null);
    if (intervalos.length === 0) continue;
    // Regra posterior sobrescreve: aproximacao razoavel para o subconjunto que aparece na pratica.
    for (const d of dias) semana[d] = intervalos;
    alguma = true;
  }
  return alguma ? semana : null;
}

/** Formato do Google Places em pt-BR/pt-PT: um "Dia: horario" por trecho. */
function parsePt(texto: string): Semana | null {
  const trechos = texto.split("·").map((t) => t.trim()).filter(Boolean);
  const semana = novaSemana();
  let alguma = false;

  for (const trecho of trechos) {
    const i = trecho.indexOf(":");
    if (i < 0) continue;
    const dia = DIAS_PT[trecho.slice(0, i).trim().toLowerCase()];
    const resto = trecho.slice(i + 1).trim();
    if (dia === undefined) continue;

    if (/fechad[oa]/i.test(resto)) {
      semana[dia] = [];
      alguma = true;
      continue;
    }
    if (/24\s*horas/i.test(resto)) {
      semana[dia] = [{ inicio: 0, fim: 24 * 60 }];
      alguma = true;
      continue;
    }
    const intervalos = resto
      .split(",")
      .map(parseIntervalo)
      .filter((x): x is Intervalo => x !== null);
    if (intervalos.length > 0) {
      semana[dia] = intervalos;
      alguma = true;
    }
  }
  return alguma ? semana : null;
}

/** Detecta o formato e devolve a semana interpretada, ou null se nao reconhecer nada. */
const PRIMEIRO_DIA_PT = new RegExp(
  `^(${Object.keys(DIAS_PT).join("|")})\\s*:`,
  "i",
);

export function horarioSemanal(texto: string): Semana | null {
  const t = texto.trim();
  if (!t) return null;
  if (/^24\/7$/i.test(t) || /\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/i.test(t)) return parseOsm(t);
  // Normalmente vem com os 7 dias juntados por " · ", mas um unico dia (sem
  // separador) tambem e valido: o nome do dia por extenso no comeco basta.
  if (t.includes("·") || PRIMEIRO_DIA_PT.test(t)) return parsePt(t);
  return null;
}

function agoraEm(fuso: string, agora: Date): { dia: number; minutos: number } {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(agora);
  const semanaMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let dia = 0;
  let hora = 0;
  let minuto = 0;
  for (const p of partes) {
    if (p.type === "weekday") dia = semanaMap[p.value] ?? 0;
    if (p.type === "hour") hora = parseInt(p.value, 10) % 24;
    if (p.type === "minute") minuto = parseInt(p.value, 10);
  }
  return { dia, minutos: hora * 60 + minuto };
}

function dentro(intervalos: Intervalo[], minutos: number, comoOntem: boolean): boolean {
  return intervalos.some((iv) => {
    if (comoOntem) return iv.fim > 24 * 60 && minutos < iv.fim - 24 * 60;
    if (iv.fim <= 24 * 60) return minutos >= iv.inicio && minutos < iv.fim;
    return minutos >= iv.inicio; // passa da meia-noite: a partir do inicio ja conta como aberto
  });
}

/**
 * true/false quando da para saber; null quando o texto nao bate com nenhum
 * formato reconhecido — nesse caso a tela nao exibe selo nenhum.
 */
export function estaAbertoAgora(
  texto: string | null,
  country: string,
  agora: Date = new Date(),
): boolean | null {
  if (!texto) return null;
  const semana = horarioSemanal(texto);
  if (!semana) return null;
  const fuso = FUSO[country] ?? FUSO.BR;
  const { dia, minutos } = agoraEm(fuso, agora);
  const hoje = dentro(semana[dia], minutos, false);
  const ontem = dentro(semana[(dia + 6) % 7], minutos, true);
  return hoje || ontem;
}
