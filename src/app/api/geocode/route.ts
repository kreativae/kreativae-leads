import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const UA = "kreatae-leads-radar/1.0 (https://kreativ.ae)";

interface NominatimHit {
  lat: string;
  lon: string;
  display_name?: string;
  name?: string;
  type?: string;
  addresstype?: string;
  address?: {
    state?: string;
    /** Portugal usa county (distrito) no lugar de state. */
    county?: string;
    country?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
  };
}

/**
 * Autocomplete de lugares. Serve tanto o mapa (modo raio) quanto o campo de
 * cidade. Com kind=city usa featureType=settlement para so trazer
 * cidades/vilas, em vez de ruas e estabelecimentos.
 */
export async function GET(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  // A Nominatim pede no maximo ~1 req/s por cliente; o debounce do front
  // ajuda, mas nao impede um teclado preso.
  const limited = rateLimit(`geocode:${clientIp(req)}`, 40, 60);
  if (limited !== null)
    return NextResponse.json({ results: [], error: "Muitas buscas seguidas. Aguarde um instante." });

  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim();
  const kind = sp.get("kind");
  const country = sp.get("country");
  if (q.length < 3) return NextResponse.json({ results: [] });

  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    limit: "6",
    addressdetails: "1",
  });
  if (kind === "city") params.set("featureType", "settlement");
  if (country === "BR") params.set("countrycodes", "br");
  else if (country === "PT") params.set("countrycodes", "pt");

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": UA, "Accept-Language": "pt" },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error("nominatim");
    const arr = (await res.json()) as NominatimHit[];

    return NextResponse.json({
      results: arr.map((h) => {
        const nome =
          h.name ??
          h.address?.city ??
          h.address?.town ??
          h.address?.village ??
          h.address?.municipality ??
          q;
        const pais = h.address?.country ?? null;
        // BR traz state ("Paraná"); PT traz county ("Setúbal"). Sem o
        // municipio, quatro "Santo André" portugueses ficariam identicos.
        const regiao = [
          h.address?.municipality ?? h.address?.town,
          h.address?.state ?? h.address?.county,
        ].filter((v): v is string => !!v && v !== nome);
        const regiaoUnica = [...new Set(regiao)];
        return {
          // label completo mantido para o mapa, que ja o usa
          label: h.display_name ?? nome,
          // texto curto para o campo, e preciso o bastante para geocodificar
          short: [nome, ...regiaoUnica, pais].filter(Boolean).join(", "),
          name: nome,
          state: regiaoUnica.join(" · ") || null,
          country: pais,
          lat: Number(h.lat),
          lon: Number(h.lon),
          kind: h.addresstype ?? h.type ?? null,
        };
      }),
    });
  } catch {
    return NextResponse.json({ results: [], error: "Busca de endereço indisponível." });
  }
}
