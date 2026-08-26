import { NextResponse } from "next/server";
import { db } from "@/db";
import { leads, searches, type Lead } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { matchSegment, queryForRound } from "@/lib/constants";
import {
  buildOverpassQuery,
  contactScore,
  geocodeCity,
  normalizeElements,
  queryOverpass,
  reverseGeocode,
  type NormalizedLead,
} from "@/lib/osm";
import { getEffectiveSetting } from "@/lib/settings-db";
import { searchPlaces } from "@/lib/places";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface SearchBody {
  segment?: unknown;
  city?: unknown;
  country?: unknown;
  limit?: unknown;
  mode?: unknown;
  round?: unknown;
  lat?: unknown;
  lon?: unknown;
  radiusKm?: unknown;
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  let body: SearchBody;
  try {
    body = (await req.json()) as SearchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const segmentRaw = typeof body.segment === "string" ? body.segment.trim() : "";
  const mode = body.mode === "radius" ? "radius" : "city";
  const round =
    typeof body.round === "number" ? Math.max(0, Math.min(20, Math.floor(body.round))) : 0;
  const city = typeof body.city === "string" ? body.city.trim() : "";
  let country = body.country === "PT" ? "PT" : "BR";
  const limit = Math.max(
    20,
    Math.min(150, typeof body.limit === "number" ? Math.floor(body.limit) : 80),
  );

  if (segmentRaw.length < 2 || segmentRaw.length > 60)
    return NextResponse.json(
      { ok: false, error: "Informe um segmento válido (ex.: Advogados)." },
      { status: 400 },
    );

  const lat = typeof body.lat === "number" ? body.lat : NaN;
  const lon = typeof body.lon === "number" ? body.lon : NaN;
  const radiusKm =
    typeof body.radiusKm === "number" ? Math.min(50, Math.max(0.5, body.radiusKm)) : 5;

  if (mode === "radius") {
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180)
      return NextResponse.json(
        { ok: false, error: "Selecione um ponto válido no mapa." },
        { status: 400 },
      );
  } else if (city.length < 2 || city.length > 80) {
    return NextResponse.json(
      { ok: false, error: "Informe uma cidade válida (ex.: Londrina, PR)." },
      { status: 400 },
    );
  }

  const matched = matchSegment(segmentRaw);
  const startedAt = Date.now();

  // Name the searched region up-front so the history is readable.
  let regionLabel = city;
  let geoCityName = city;
  let geoState: string | null = null;
  if (mode === "radius") {
    const rev = await reverseGeocode(lat, lon);
    regionLabel = `${rev.label} · ${radiusKm} km`;
    geoCityName = rev.city;
    geoState = rev.state;
    country = rev.country === "PT" ? "PT" : "BR";
  }

  const [search] = await db
    .insert(searches)
    .values({
      segment: matched.displayLabel,
      city: regionLabel,
      state: geoState,
      country,
      mode,
      round,
      lat: mode === "radius" ? lat : null,
      lon: mode === "radius" ? lon : null,
      radiusKm: mode === "radius" ? radiusKm : null,
      status: "running",
    })
    .returning();

  try {
    const sourcePref = (await getEffectiveSetting("data_source")) ?? "auto";
    const placesKey = await getEffectiveSetting(
      "google_places_key",
      "GOOGLE_PLACES_API_KEY",
    );

    let normalized: NormalizedLead[] = [];
    let source = "osm";

    if (placesKey && sourcePref !== "osm") {
      try {
        normalized = (
          await searchPlaces({
            // Rodada 0 = rotulo do segmento; 1+ = formulacoes alternativas,
            // que e o unico jeito de passar dos 60 por consulta do Google.
            textQuery:
              mode === "radius"
                ? `${queryForRound(matched.key, matched.displayLabel, round)} perto de ${geoCityName}`
                : `${queryForRound(matched.key, matched.displayLabel, round)} em ${city}`,
            apiKey: placesKey,
            limit: Math.min(60, limit),
            country,
            circle:
              mode === "radius"
                ? { lat, lon, radiusMeters: radiusKm * 1000 }
                : undefined,
          })
        ).slice(0, limit);
        source = "places";
      } catch (placesErr) {
        if (sourcePref === "places") throw placesErr;
        // auto mode: silently fall back to OpenStreetMap
      }
    }

    if (source === "osm") {
      const base = {
        tags: matched.tags,
        term: matched.tags ? undefined : segmentRaw,
      };

      if (mode === "radius") {
        const aroundQuery = buildOverpassQuery({
          ...base,
          spatial: { kind: "around", lat, lon, radiusMeters: radiusKm * 1000 },
          limit: 400,
          timeoutSeconds: 55,
        });
        const elements = await queryOverpass({
          areaQuery: aroundQuery,
          bboxQuery: null,
        });
        normalized = normalizeElements(elements, country).slice(0, limit);
      } else {
        const geo = await geocodeCity(city, country);
        geoCityName = geo.cityName;
        geoState = geo.state;
        const areaQuery = buildOverpassQuery({
          ...base,
          spatial: { kind: "area", id: geo.areaId },
          limit: Math.min(400, limit + 60),
          timeoutSeconds: 60,
        });
        const bboxQuery = geo.bbox
          ? buildOverpassQuery({
              ...base,
              spatial: { kind: "bbox", value: geo.bbox },
              limit: 400,
              timeoutSeconds: 45,
            })
          : null;
        const elements = await queryOverpass({ areaQuery, bboxQuery });
        normalized = normalizeElements(elements, country).slice(0, limit);
      }
    }

    // Quais ja existiam ANTES desta busca — o upsert abaixo revincula todos,
    // entao a contagem de novos precisa ser feita agora.
    let alreadyKnown = new Set<string>();
    if (normalized.length > 0) {
      const existing = await db
        .select({ osmId: leads.osmId })
        .from(leads)
        .where(inArray(leads.osmId, normalized.map((n) => n.osmId)));
      alreadyKnown = new Set(existing.map((e) => e.osmId));
    }

    let inserted: Lead[] = [];
    if (normalized.length > 0) {
      inserted = await db
        .insert(leads)
        .values(
          normalized.map((n) => ({
            searchId: search.id,
            osmId: n.osmId,
            companyName: n.companyName,
            ownerName: n.ownerName,
            segment: matched.displayLabel,
            city: n.city ?? geoCityName,
            state: geoState,
            country,
            address: n.address,
            neighborhood: n.neighborhood,
            postcode: n.postcode,
            lat: n.lat,
            lon: n.lon,
            phone: n.phone,
            phoneAlt: n.phoneAlt,
            whatsapp: n.whatsapp,
            whatsappSource: n.whatsappSource,
            email: n.email,
            website: n.website,
            instagram: n.instagram,
            facebook: n.facebook,
            linkedin: n.linkedin,
            openingHours: n.openingHours,
            rating: n.rating,
            reviewsCount: n.reviewsCount,
            priceLevel: n.priceLevel,
            googleMapsUri: n.googleMapsUri,
            categoryRaw: n.categoryRaw,
            extra: n.extra,
            contactScore: contactScore(n),
            opportunity: n.website ? "unreviewed" : "no_website",
          })),
        )
        // Reencontrar um lead o revincula a busca atual, em vez de descarta-lo:
        // sem isso, "Ver leads" de uma busca repetida vinha vazio. Nao tocamos
        // em status, notas nem dados de enriquecimento.
        .onConflictDoUpdate({
          target: leads.osmId,
          set: { searchId: search.id, updatedAt: new Date() },
        })
        .returning();
    }

    const durationMs = Date.now() - startedAt;
    const newCount = normalized.filter((n) => !alreadyKnown.has(n.osmId)).length;
    const withPhoneCount = normalized.filter((l) => l.phone).length;
    const withWhatsappCount = normalized.filter((l) => l.whatsapp).length;
    const noWebsiteCount = normalized.filter((l) => !l.website).length;

    await db
      .update(searches)
      .set({
        status: "done",
        state: geoState,
        source,
        resultsCount: normalized.length,
        newCount,
        withPhoneCount,
        withWhatsappCount,
        noWebsiteCount,
        durationMs,
      })
      .where(eq(searches.id, search.id));

    return NextResponse.json({
      ok: true,
      search: {
        id: search.id,
        segment: matched.displayLabel,
        city: regionLabel,
        state: geoState,
        country,
        source,
        mode,
        round,
        radiusKm: mode === "radius" ? radiusKm : null,
        resultsCount: normalized.length,
        newCount,
        withPhoneCount,
        withWhatsappCount,
        noWebsiteCount,
        durationMs,
      },
      leads: inserted.slice(0, 10),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro inesperado na busca.";
    await db
      .update(searches)
      .set({ status: "failed", error: message, durationMs: Date.now() - startedAt })
      .where(eq(searches.id, search.id));
    return NextResponse.json(
      { ok: false, error: message, searchId: search.id },
      { status: 502 },
    );
  }
}
