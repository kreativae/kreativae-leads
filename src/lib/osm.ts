import { toWhatsappDigits, whatsappDigits } from "./phone";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const UA = "kreatae-leads-radar/1.0 (https://kreativ.ae)";

export interface GeocodeResult {
  areaId: number;
  displayName: string;
  cityName: string;
  state: string | null;
  /** Overpass bbox string "south,west,north,east" — fast spatial index. */
  bbox: string | null;
}

interface NominatimItem {
  osm_type: string;
  osm_id: number;
  name?: string;
  display_name?: string;
  boundingbox?: string[];
  address?: { state?: string; city?: string; town?: string; municipality?: string };
}

export async function geocodeCity(
  query: string,
  country: string,
): Promise<GeocodeResult> {
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(
    query,
  )}&format=jsonv2&limit=1&addressdetails=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "pt" },
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Falha ao geocodificar a cidade (Nominatim).");
  const arr = (await res.json()) as NominatimItem[];
  const g = arr[0];
  if (!g) throw new Error(`Cidade não encontrada: "${query}". Tente outro nome.`);
  const n = Number(g.osm_id);
  let areaId: number | null = null;
  if (g.osm_type === "relation") areaId = 3_600_000_000 + n;
  else if (g.osm_type === "way") areaId = 2_400_000_000 + n;
  if (!areaId)
    throw new Error(
      "A cidade encontrada não possui área delimitada no OpenStreetMap.",
    );
  let bbox: string | null = null;
  if (Array.isArray(g.boundingbox) && g.boundingbox.length === 4) {
    // Nominatim: [latMin, latMax, lonMin, lonMax] → Overpass: south,west,north,east
    const [latMin, latMax, lonMin, lonMax] = g.boundingbox;
    bbox = `${latMin},${lonMin},${latMax},${lonMax}`;
  }
  return {
    areaId,
    displayName: g.display_name ?? query,
    cityName: g.name ?? query,
    state: g.address?.state ?? null,
    bbox,
  };
}

function escapeOverpassRegex(term: string): string {
  return term.replace(/["\\\n\r]/g, " ").trim();
}

export type Spatial =
  | { kind: "area"; id: number }
  | { kind: "bbox"; value: string }
  | { kind: "around"; lat: number; lon: number; radiusMeters: number };

export function buildOverpassQuery(opts: {
  spatial: Spatial;
  tags: [string, string][] | null;
  term?: string;
  limit: number;
  timeoutSeconds?: number;
}): string {
  const sp = opts.spatial;
  const filter =
    sp.kind === "area"
      ? (q: string) => `${q}(area.a);`
      : sp.kind === "bbox"
        ? (q: string) => `${q}(${sp.value});`
        : (q: string) =>
            `${q}(around:${Math.round(sp.radiusMeters)},${sp.lat},${sp.lon});`;

  let body: string;
  if (opts.tags && opts.tags.length > 0) {
    body = opts.tags.map(([k, v]) => filter(`nwr["${k}"="${v}"]`)).join("\n");
  } else {
    const t = escapeOverpassRegex(opts.term ?? "");
    body = ["office", "shop", "craft", "amenity", "healthcare"]
      .map((k) => filter(`nwr["${k}"]["name"~"${t}",i]`))
      .join("\n");
  }

  const timeout = opts.timeoutSeconds ?? 60;
  const areaDef =
    opts.spatial.kind === "area" ? `area(${opts.spatial.id})->.a;\n` : "";
  return `[out:json][timeout:${timeout}];\n${areaDef}(\n${body}\n);\nout center tags ${opts.limit};`;
}

export interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

async function fetchOverpassAt(
  mirror: string,
  query: string,
  timeoutMs: number,
): Promise<OsmElement[]> {
  const res = await fetch(mirror, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Overpass respondeu ${res.status}`);
  const data = (await res.json()) as { elements?: OsmElement[] };
  return data.elements ?? [];
}

/**
 * Tries the precise administrative-area query first; on timeout/failure falls
 * back to a fast bounding-box query (spatial index) on the mirrors.
 */
export async function queryOverpass(opts: {
  areaQuery: string;
  bboxQuery: string | null;
  areaTimeoutMs?: number;
  bboxTimeoutMs?: number;
}): Promise<OsmElement[]> {
  const areaTimeout = opts.areaTimeoutMs ?? 72_000;
  const bboxTimeout = opts.bboxTimeoutMs ?? 60_000;
  let lastError: unknown = null;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  try {
    return await fetchOverpassAt(OVERPASS_MIRRORS[0], opts.areaQuery, areaTimeout);
  } catch (err) {
    lastError = err;
  }

  if (opts.bboxQuery) {
    for (const mirror of OVERPASS_MIRRORS) {
      try {
        return await fetchOverpassAt(mirror, opts.bboxQuery, bboxTimeout);
      } catch (err) {
        lastError = err;
      }
    }
  } else {
    for (const mirror of OVERPASS_MIRRORS.slice(1)) {
      try {
        return await fetchOverpassAt(mirror, opts.areaQuery, areaTimeout);
      } catch (err) {
        lastError = err;
      }
    }
  }

  // Mirrors are frequently rate-limited (429/502) for a few seconds — retry.
  for (let attempt = 0; attempt < 2; attempt++) {
    await wait(2_500 * (attempt + 1));
    for (const mirror of OVERPASS_MIRRORS) {
      try {
        return await fetchOverpassAt(
          mirror,
          opts.bboxQuery ?? opts.areaQuery,
          bboxTimeout,
        );
      } catch (err) {
        lastError = err;
      }
    }
  }

  throw new Error(
    `Servidores OpenStreetMap indisponíveis no momento. ${
      lastError instanceof Error ? `(${lastError.message})` : ""
    }`,
  );
}

export interface NormalizedLead {
  osmId: string;
  companyName: string;
  ownerName: string | null;
  phone: string | null;
  phoneAlt: string | null;
  whatsapp: string | null;
  /** declared = a empresa declarou; inferred = deduzido do formato do numero. */
  whatsappSource: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  neighborhood: string | null;
  postcode: string | null;
  lat: number | null;
  lon: number | null;
  instagram: string | null;
  facebook: string | null;
  linkedin: string | null;
  openingHours: string | null;
  categoryRaw: string | null;
  rating: number | null;
  reviewsCount: number | null;
  priceLevel: string | null;
  googleMapsUri: string | null;
  extra: Record<string, string> | null;
}

/** 0-100 score of how actionable the lead's contact data is. */
export function contactScore(l: NormalizedLead): number {
  let s = 0;
  if (l.whatsapp) s += 35;
  else if (l.phone) s += 18;
  if (l.phoneAlt) s += 5;
  if (l.email) s += 18;
  if (l.ownerName) s += 12;
  if (l.instagram || l.facebook || l.linkedin) s += 10;
  if (l.address) s += 8;
  if (l.openingHours) s += 4;
  if (l.lat && l.lon) s += 3;
  if (!l.website) s += 5; // easier pitch
  return Math.min(100, s);
}

function socialHandle(raw: string | null, domain: string): string | null {
  if (!raw) return null;
  let v = raw.trim().split(";")[0].trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      v = u.pathname.replace(/^\/+|\/+$/g, "");
    } catch {
      return null;
    }
  }
  v = v.replace(/^@/, "").replace(/\/$/, "");
  if (!v) return null;
  return `https://${domain}/${v}`;
}

function pick(tags: Record<string, string>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = tags[k];
    if (v && v.trim()) return v.trim();
  }
  return null;
}

function normalizeWebsite(raw: string | null): string | null {
  if (!raw) return null;
  let w = raw.trim();
  if (!w) return null;
  // OSM sometimes stores multiple values separated by ";"
  w = w.split(";")[0].trim();
  if (!/^https?:\/\//i.test(w)) w = "https://" + w;
  try {
    const u = new URL(w);
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function slugify(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

const EXTRA_TAG_KEYS = [
  "cuisine",
  "brand",
  "healthcare:speciality",
  "lawyer:type",
  "architect:type",
  "description",
  "wheelchair",
  "payment:credit_cards",
  "capacity",
  "start_date",
  "ref:vatin",
  "operator:type",
  "check_date",
];

function categoryOf(tags: Record<string, string>): string | null {
  for (const k of ["office", "shop", "amenity", "healthcare", "craft", "leisure"]) {
    if (tags[k]) return `${k}=${tags[k]}`;
  }
  return null;
}

export function normalizeElements(
  elements: OsmElement[],
  country: string,
): NormalizedLead[] {
  const out: NormalizedLead[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  for (const el of elements) {
    const tags = el.tags;
    if (!tags || !tags.name) continue;
    const osmId = `${el.type[0]}${el.id}`;
    if (seenIds.has(osmId)) continue;

    const companyName = tags.name.trim();
    const nameKey = `${slugify(companyName)}|${slugify(tags["addr:city"] ?? "")}`;
    if (nameKey.length > 3 && seenNames.has(nameKey)) continue;

    const phone = pick(tags, "contact:phone", "phone");
    const mobile = pick(tags, "contact:mobile", "mobile");
    const directWhatsapp = pick(tags, "contact:whatsapp");
    // A tag contact:whatsapp e declaracao da propria empresa: vale mesmo em
    // fixo. Os demais so entram se tiverem formato de celular.
    const declaredWhatsapp = toWhatsappDigits(directWhatsapp, country);
    const whatsapp =
      declaredWhatsapp ??
      whatsappDigits(mobile, country) ??
      whatsappDigits(phone, country);
    const whatsappSource = whatsapp
      ? declaredWhatsapp
        ? "declared"
        : "inferred"
      : null;
    const phoneAlt = mobile && mobile !== phone ? mobile : null;

    const addressParts = [
      tags["addr:street"]
        ? `${tags["addr:street"]}${tags["addr:housenumber"] ? ", " + tags["addr:housenumber"] : ""}`
        : null,
      tags["addr:suburb"] ?? null,
      tags["addr:city"] ?? null,
    ].filter(Boolean);

    const extra: Record<string, string> = {};
    for (const k of EXTRA_TAG_KEYS) if (tags[k]) extra[k] = tags[k];

    seenIds.add(osmId);
    seenNames.add(nameKey);

    const lead: NormalizedLead = {
      osmId,
      companyName,
      ownerName: pick(tags, "owner", "contact:owner", "operator"),
      phone,
      phoneAlt,
      whatsapp,
      whatsappSource,
      email: pick(tags, "contact:email", "email"),
      website: normalizeWebsite(
        pick(tags, "contact:website", "website", "url", "contact:url"),
      ),
      address: addressParts.length ? addressParts.join(" · ") : null,
      city: tags["addr:city"]?.trim() ?? null,
      neighborhood: pick(tags, "addr:suburb", "addr:neighbourhood", "addr:district"),
      postcode: pick(tags, "addr:postcode"),
      lat: el.lat ?? el.center?.lat ?? null,
      lon: el.lon ?? el.center?.lon ?? null,
      instagram: socialHandle(
        pick(tags, "contact:instagram", "instagram"),
        "instagram.com",
      ),
      facebook: socialHandle(
        pick(tags, "contact:facebook", "facebook"),
        "facebook.com",
      ),
      linkedin: socialHandle(
        pick(tags, "contact:linkedin", "linkedin"),
        "linkedin.com",
      ),
      openingHours: pick(tags, "opening_hours"),
      categoryRaw: categoryOf(tags),
      rating: null,
      reviewsCount: null,
      priceLevel: null,
      googleMapsUri: null,
      extra: Object.keys(extra).length ? extra : null,
    };
    out.push(lead);
  }

  // Prioritize leads with the richest, most actionable contact data
  out.sort((a, b) => contactScore(b) - contactScore(a));
  return out;
}

/** Reverse geocode a point to name the region (used by radius searches). */
export async function reverseGeocode(
  lat: number,
  lon: number,
): Promise<{ label: string; city: string; state: string | null; country: string }> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&addressdetails=1&zoom=14`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "pt" },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error("reverse failed");
    const g = (await res.json()) as {
      address?: Record<string, string>;
      display_name?: string;
    };
    const a = g.address ?? {};
    const city =
      a.city ?? a.town ?? a.municipality ?? a.village ?? a.county ?? "Região";
    const area = a.suburb ?? a.neighbourhood ?? a.city_district ?? null;
    const cc = (a.country_code ?? "br").toUpperCase();
    return {
      label: area ? `${area}, ${city}` : city,
      city,
      state: a.state ?? null,
      country: cc === "PT" ? "PT" : cc,
    };
  } catch {
    return {
      label: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
      city: "Região no mapa",
      state: null,
      country: "BR",
    };
  }
}
