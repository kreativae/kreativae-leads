import { normalizeWebsite, type NormalizedLead } from "@/lib/osm";
import { whatsappDigits, toWhatsappDigits, digitsOnly } from "@/lib/phone";

/**
 * Transforma um resultado orgânico do Google (título + link + trecho) num
 * candidato a lead, extraindo o que der do texto: e-mail, telefone,
 * WhatsApp, @ do Instagram e redes. Puro — sem rede, testável direto.
 *
 * Só olha o que o Google mostra na prévia; não abre a página. Por isso o
 * resultado é parcial de propósito: a pessoa confere e completa antes de
 * adicionar.
 */

export interface ResultadoBusca {
  title: string;
  link: string;
  snippet?: string;
}

export interface CandidatoComando extends NormalizedLead {
  /** Link do resultado no Google — o que a pessoa clica pra conferir. */
  link: string;
  snippet: string;
  /** Todos os e-mails achados no trecho (o primeiro também vai em `email`). */
  emails: string[];
  telefones: string[];
  instagramHandle: string | null;
  existingLeadId: string | null;
}

const RE_EMAIL = /[a-z0-9][a-z0-9._%+-]*@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
// (11) 98765-4321 · 11 98765 4321 · +55 11 3456-7890 · 11987654321
const RE_TELEFONE_BR = /(?:\+?55[\s.-]?)?\(?\b[1-9]{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g;
const RE_WA_ME = /(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?(\d{10,15})/i;
const RE_ARROBA = /(?:^|[\s(])@([a-z0-9._]{2,30})/i;

const IG_RESERVADOS = new Set([
  "p", "reel", "reels", "explore", "stories", "tv", "accounts", "tags", "directory", "about", "legal",
]);

const SUFIXOS_TITULO = [
  /\s*•\s*(fotos e vídeos do )?instagram.*$/i,
  /\s*[|•·-]\s*instagram( photos and videos)?\s*$/i,
  /\s*instagram photos and videos\s*$/i,
  /\s*[|•·-]\s*linkedin\s*$/i,
  /\s*[|•·-]\s*facebook\s*$/i,
  /\s*[|•·-]\s*linktree\s*$/i,
  /\s*[|•·-]\s*jusbrasil\s*$/i,
  /\s*[|•·-]\s*doctoralia\s*$/i,
];

function hostDe(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function caminhoDe(link: string): string[] {
  try {
    return new URL(link).pathname.split("/").filter(Boolean);
  } catch {
    return [];
  }
}

function handleInstagram(link: string, texto: string): string | null {
  const host = hostDe(link);
  if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    const [primeiro] = caminhoDe(link);
    if (primeiro && !IG_RESERVADOS.has(primeiro.toLowerCase()) && /^[a-z0-9._]{1,30}$/i.test(primeiro))
      return primeiro.toLowerCase();
  }
  // Fora do Instagram, só confia num @ se o texto fala de Instagram — um
  // "@fulano" solto pode ser de qualquer rede.
  if (/instagram|insta\b/i.test(texto)) {
    const m = texto.match(RE_ARROBA);
    if (m && !m[1].includes("..") && !/\.(com|br|net)$/i.test(m[1])) return m[1].toLowerCase().replace(/\.$/, "");
  }
  return null;
}

function limparTitulo(title: string): string {
  let t = title;
  for (const re of SUFIXOS_TITULO) t = t.replace(re, "");
  t = t.replace(/\(@[^)]*\)/g, "").replace(/\s+/g, " ").trim();
  return t.replace(/[|•·-]\s*$/, "").trim();
}

function unicos(lista: string[]): string[] {
  return [...new Set(lista)];
}

export function extrairEmails(texto: string): string[] {
  return unicos(
    (texto.match(RE_EMAIL) ?? [])
      .map((e) => e.toLowerCase().replace(/\.+$/, ""))
      // Imagem/arquivo com @ no nome (logo@2x.png) não é e-mail.
      .filter((e) => !/\.(png|jpe?g|gif|webp|svg)$/.test(e)),
  );
}

export function extrairTelefones(texto: string): string[] {
  return unicos(
    (texto.match(RE_TELEFONE_BR) ?? [])
      .map((t) => digitsOnly(t))
      .map((d) => (d.startsWith("55") && d.length >= 12 ? d.slice(2) : d))
      .filter((d) => d.length === 10 || d.length === 11),
  );
}

export function extrairCandidato(
  r: ResultadoBusca,
  contexto: { city?: string | null; categoria?: string | null } = {},
): CandidatoComando {
  const snippet = (r.snippet ?? "").trim();
  const texto = `${r.title} ${snippet}`;
  const host = hostDe(r.link);
  const emails = extrairEmails(texto);
  const telefones = extrairTelefones(texto);

  const waDeclarado = texto.match(RE_WA_ME)?.[1] ?? null;
  const whatsapp = waDeclarado
    ? toWhatsappDigits(waDeclarado, "BR")
    : (telefones.map((t) => whatsappDigits(t, "BR")).find(Boolean) ?? null);
  const fixo = telefones.find((t) => !whatsappDigits(t, "BR")) ?? null;
  const celular = telefones.find((t) => whatsappDigits(t, "BR")) ?? null;

  const ig = handleInstagram(r.link, texto);
  const ehRede = /(^|\.)(instagram|facebook|linkedin|linktr|tiktok|youtube|twitter|x)\.(com|ee)$/.test(host);
  const ehDiretorio = /(^|\.)(jusbrasil|doctoralia)\.com\.br$/.test(host);

  const nome = limparTitulo(r.title) || (ig ? `@${ig}` : host);

  // Mesmo osmId que a busca por @ do Buscador usa: o mesmo perfil nunca
  // vira dois leads, venha de onde vier.
  const osmId = ig && host.endsWith("instagram.com")
    ? `ig:${ig}`
    : `web:${host}/${caminhoDe(r.link).join("/")}`.replace(/\/$/, "").toLowerCase();

  return {
    osmId,
    companyName: nome.slice(0, 200),
    ownerName: null,
    phone: celular ?? fixo,
    phoneAlt: celular && fixo ? fixo : null,
    whatsapp,
    whatsappSource: whatsapp ? (waDeclarado ? "declared" : "inferred") : null,
    email: emails[0] ?? null,
    website: ehRede || ehDiretorio ? null : normalizeWebsite(r.link),
    address: null,
    city: contexto.city ?? null,
    neighborhood: null,
    postcode: null,
    lat: null,
    lon: null,
    instagram: ig ? `https://instagram.com/${ig}` : null,
    facebook: host.endsWith("facebook.com") ? r.link : null,
    linkedin: host.endsWith("linkedin.com") ? r.link : null,
    openingHours: null,
    categoryRaw: contexto.categoria ?? null,
    rating: null,
    reviewsCount: null,
    priceLevel: null,
    googleMapsUri: null,
    extra: {
      origem: "comandos",
      link: r.link,
      ...(snippet ? { trecho: snippet.slice(0, 500) } : {}),
    },
    link: r.link,
    snippet,
    emails,
    telefones,
    instagramHandle: ig,
    existingLeadId: null,
  };
}

/** Tem algum jeito de falar com a pessoa? (e-mail, telefone ou WhatsApp) */
export function temContato(c: CandidatoComando): boolean {
  return !!(c.email || c.phone || c.whatsapp);
}
