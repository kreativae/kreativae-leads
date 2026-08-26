import { digitsOnly, whatsappDigits } from "./phone";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface EnrichResult {
  emails: string[];
  phones: string[];
  whatsapps: string[];
  instagram: string | null;
  facebook: string | null;
  linkedin: string | null;
  ownerName: string | null;
  /** true quando algum numero veio de link wa.me — declaracao explicita. */
  whatsappDeclared: boolean;
  taxId: string | null; // CNPJ / NIPC
  pagesScanned: string[];
}

const IGNORED_EMAIL = /\.(png|jpe?g|gif|svg|webp|css|js)$/i;
const PLACEHOLDER_EMAIL =
  /^(email|seu-?email|your-?email|nome|exemplo|example|test|domain|user)@/i;
/** Telemetry/CDN/builder domains that leak fake addresses into page source. */
const JUNK_EMAIL_DOMAIN =
  /@(sentry|.*\.sentry|sentry-next\.wixpress|.*\.wixpress|wix|sentry\.io|godaddy|squarespace|elementor|w3\.org|schema\.org|example\.(com|org))/i;
/** 32-hex local parts are Sentry/analytics keys, never real inboxes. */
const HASH_LOCALPART = /^[a-f0-9]{16,}@/i;

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(11_000),
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xhtml+xml" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html")) return null;
    return (await res.text()).slice(0, 600_000);
  } catch {
    return null;
  }
}

function absolute(base: string, href: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

/** Finds likely "contact" / "about" pages to scan for richer data. */
function contactLinks(html: string, baseUrl: string): string[] {
  const out = new Set<string>();
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    const label = m[2].replace(/<[^>]+>/g, " ").toLowerCase();
    const target = `${href.toLowerCase()} ${label}`;
    if (
      /contat|contact|fale-?conosco|quem-?somos|sobre|about|equipe|team|equipa/.test(
        target,
      )
    ) {
      const abs = absolute(baseUrl, href);
      if (!abs) continue;
      try {
        if (new URL(abs).hostname !== new URL(baseUrl).hostname) continue;
      } catch {
        continue;
      }
      out.add(abs.split("#")[0]);
    }
    if (out.size >= 3) break;
  }
  return [...out];
}

function extractFrom(html: string, country: string, acc: EnrichResult) {
  // Emails (plain + mailto)
  const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,12}/gi;
  for (const raw of html.match(emailRe) ?? []) {
    const e = raw.toLowerCase().replace(/^mailto:/, "");
    if (
      IGNORED_EMAIL.test(e) ||
      PLACEHOLDER_EMAIL.test(e) ||
      JUNK_EMAIL_DOMAIN.test(e) ||
      HASH_LOCALPART.test(e)
    )
      continue;
    if (e.length > 80) continue;
    if (!acc.emails.includes(e)) acc.emails.push(e);
  }

  // wa.me / api.whatsapp.com links → strongest WhatsApp signal
  const waRe =
    /(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=|web\.whatsapp\.com\/send\?phone=)(\+?\d{8,15})/gi;
  let wm: RegExpExecArray | null;
  while ((wm = waRe.exec(html)) !== null) {
    const d = digitsOnly(wm[1]);
    const full = d.length >= 12 ? d : (country === "PT" ? "351" : "55") + d;
    if (!acc.whatsapps.includes(full)) acc.whatsapps.push(full);
    acc.whatsappDeclared = true;
  }

  // tel: links and BR/PT formatted numbers
  const telRe = /tel:([+\d][\d\s().-]{7,20})/gi;
  let tm: RegExpExecArray | null;
  while ((tm = telRe.exec(html)) !== null) {
    const p = tm[1].trim();
    if (!acc.phones.includes(p)) acc.phones.push(p);
    const w = whatsappDigits(p, country);
    if (w && !acc.whatsapps.includes(w)) acc.whatsapps.push(w);
  }
  // Loose scan only for BR-formatted numbers: require separators or parentheses
  // so timestamps/IDs (e.g. "1787446425") are never mistaken for phones.
  if (country !== "PT") {
    const brRe = /\(\d{2}\)\s?9?\d{4}[\s.-]?\d{4}|\b\d{2}[\s.-]9?\d{4}[\s.-]\d{4}\b/g;
    for (const raw of html.replace(/<[^>]+>/g, " ").match(brRe) ?? []) {
      const p = raw.trim();
      if (acc.phones.length < 6 && !acc.phones.includes(p)) acc.phones.push(p);
      const w = whatsappDigits(p, country);
      if (w && !acc.whatsapps.includes(w)) acc.whatsapps.push(w);
    }
  }
  // Drop anything that survived but isn't a plausible phone (8–15 digits).
  acc.phones = acc.phones.filter((p) => {
    const d = digitsOnly(p);
    return d.length >= 8 && d.length <= 15;
  });

  // Socials
  const social = (
    re: RegExp,
    domain: string,
    key: "instagram" | "facebook" | "linkedin",
  ) => {
    if (acc[key]) return;
    const m = html.match(re);
    if (!m) return;
    const handle = m[1].replace(/["'?/].*$/, "").trim();
    if (!handle || handle.length > 60) return;
    if (/^(sharer|share|plugins|tr|login|home|profile\.php)$/i.test(handle)) return;
    acc[key] = `https://${domain}/${handle}`;
  };
  social(/instagram\.com\/([A-Za-z0-9._-]{2,40})/i, "instagram.com", "instagram");
  social(/facebook\.com\/([A-Za-z0-9._-]{2,60})/i, "facebook.com", "facebook");
  social(
    /linkedin\.com\/(?:company\/|in\/)([A-Za-z0-9._-]{2,60})/i,
    "linkedin.com/company",
    "linkedin",
  );

  // Tax id: CNPJ (BR) or NIPC (PT)
  if (!acc.taxId) {
    const cnpj = html.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/);
    if (cnpj) acc.taxId = cnpj[0];
    else {
      const nipc = html.match(/\b(?:NIPC|NIF)[:\s]*(\d{9})\b/i);
      if (nipc) acc.taxId = nipc[1];
    }
  }

  // Owner / responsible person
  if (!acc.ownerName) {
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const patterns = [
      /(?:Dra?\.|Advogad[oa]|Arquitet[oa]|Respons[áa]vel(?:\s+t[ée]cnic[oa])?|Propriet[áa]ri[oa]|S[óo]ci[oa](?:[- ]fundador[a]?)?|CEO|Diretor[a]?)\s*[:\-—]?\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zàáâãéêíóôõúç]+(?:\s+(?:d[aeo]s?\s+)?[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zàáâãéêíóôõúç]+){1,3})/,
      /\bOAB[\/\s-]?[A-Z]{2}\s*n?[º°]?\s*[\d.]+\s*[-–—]\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zàáâãéêíóôõúç]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zàáâãéêíóôõúç]+){1,3})/,
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m && m[1] && m[1].length <= 60) {
        acc.ownerName = m[1].trim();
        break;
      }
    }
  }
}

/** Crawls the lead's website (home + up to 2 contact pages) for contact data. */
export async function enrichFromWebsite(
  rawUrl: string,
  country: string,
): Promise<EnrichResult> {
  const acc: EnrichResult = {
    emails: [],
    phones: [],
    whatsapps: [],
    instagram: null,
    facebook: null,
    linkedin: null,
    ownerName: null,
    whatsappDeclared: false,
    taxId: null,
    pagesScanned: [],
  };

  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;

  const home = await fetchHtml(url);
  if (!home) return acc;
  acc.pagesScanned.push(url);
  extractFrom(home, country, acc);

  for (const link of contactLinks(home, url).slice(0, 2)) {
    const page = await fetchHtml(link);
    if (!page) continue;
    acc.pagesScanned.push(link);
    extractFrom(page, country, acc);
  }

  acc.emails = acc.emails.slice(0, 5);
  acc.phones = acc.phones.slice(0, 5);
  acc.whatsapps = acc.whatsapps.slice(0, 3);
  return acc;
}
