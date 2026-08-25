import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const UA = "kreatae-leads-radar/1.0 (https://kreativ.ae)";

interface NominatimHit {
  lat: string;
  lon: string;
  display_name?: string;
  name?: string;
  type?: string;
  addresstype?: string;
}

/** Place autocomplete for the map picker (proxied to keep the UA header). */
export async function GET(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 3) return NextResponse.json({ results: [] });

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
    q,
  )}&format=jsonv2&limit=6&addressdetails=0`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "pt" },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error("nominatim");
    const arr = (await res.json()) as NominatimHit[];
    return NextResponse.json({
      results: arr.map((h) => ({
        label: h.display_name ?? h.name ?? q,
        lat: Number(h.lat),
        lon: Number(h.lon),
        kind: h.addresstype ?? h.type ?? null,
      })),
    });
  } catch {
    return NextResponse.json({ results: [], error: "Busca de endereço indisponível." });
  }
}
