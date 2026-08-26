import type { NormalizedLead } from "./osm";
import { whatsappDigits } from "./phone";

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.location",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.primaryTypeDisplayName",
  "places.primaryType",
  "places.businessStatus",
  "places.regularOpeningHours.weekdayDescriptions",
  "nextPageToken",
].join(",");

interface AddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

interface PlaceItem {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: AddressComponent[];
  location?: { latitude?: number; longitude?: number };
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  primaryTypeDisplayName?: { text?: string };
  primaryType?: string;
  businessStatus?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
}

interface PlacesResponse {
  places?: PlaceItem[];
  nextPageToken?: string;
  error?: { message?: string };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function component(
  comps: AddressComponent[] | undefined,
  type: string,
): string | null {
  const c = comps?.find((x) => x.types?.includes(type));
  return c?.longText ?? c?.shortText ?? null;
}

function toLead(p: PlaceItem, country: string): NormalizedLead | null {
  const name = p.displayName?.text?.trim();
  if (!name || !p.id) return null;
  const phone = p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null;
  const comps = p.addressComponents;
  return {
    osmId: `gp:${p.id}`,
    companyName: name,
    ownerName: null,
    phone,
    phoneAlt:
      p.nationalPhoneNumber && p.nationalPhoneNumber !== phone
        ? p.nationalPhoneNumber
        : null,
    whatsapp: whatsappDigits(phone, country),
    // Places nao informa WhatsApp: o que temos vem do formato do telefone.
    whatsappSource: whatsappDigits(phone, country) ? "inferred" : null,
    email: null,
    website: p.websiteUri ?? null,
    address: p.formattedAddress ?? null,
    city:
      component(comps, "administrative_area_level_2") ??
      component(comps, "locality") ??
      null,
    neighborhood:
      component(comps, "sublocality_level_1") ??
      component(comps, "sublocality") ??
      null,
    postcode: component(comps, "postal_code"),
    lat: p.location?.latitude ?? null,
    lon: p.location?.longitude ?? null,
    instagram: null,
    facebook: null,
    linkedin: null,
    openingHours: p.regularOpeningHours?.weekdayDescriptions?.join(" · ") ?? null,
    categoryRaw: p.primaryTypeDisplayName?.text ?? p.primaryType ?? null,
    rating: typeof p.rating === "number" ? p.rating : null,
    reviewsCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
    priceLevel: p.priceLevel ?? null,
    googleMapsUri: p.googleMapsUri ?? null,
    extra: p.businessStatus ? { businessStatus: p.businessStatus } : null,
  };
}

/**
 * Google Places (New) Text Search — up to 3 pages of 20 results.
 * Supports an optional circular restriction (map radius search).
 */
export async function searchPlaces(opts: {
  textQuery: string;
  apiKey: string;
  limit: number;
  country: string;
  circle?: { lat: number; lon: number; radiusMeters: number };
}): Promise<NormalizedLead[]> {
  const out: NormalizedLead[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;

  for (let page = 0; page < 3 && out.length < opts.limit; page++) {
    const body: Record<string, unknown> = {
      textQuery: opts.textQuery,
      languageCode: opts.country === "PT" ? "pt-PT" : "pt-BR",
      maxResultCount: 20,
    };
    if (opts.circle) {
      body.locationRestriction = {
        circle: {
          center: { latitude: opts.circle.lat, longitude: opts.circle.lon },
          // Google allows max 50,000 m
          radius: Math.min(50_000, Math.max(1, opts.circle.radiusMeters)),
        },
      };
    }
    if (pageToken) body.pageToken = pageToken;

    const res = await fetch(PLACES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": opts.apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });

    const data = (await res.json()) as PlacesResponse;
    if (!res.ok || data.error) {
      throw new Error(
        `Google Places: ${data.error?.message ?? `HTTP ${res.status}`}`,
      );
    }

    for (const p of data.places ?? []) {
      const lead = toLead(p, opts.country);
      if (!lead || seen.has(lead.osmId)) continue;
      seen.add(lead.osmId);
      out.push(lead);
      if (out.length >= opts.limit) break;
    }

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
    await sleep(2_200); // Google requires a short delay before paging
  }

  return out;
}
