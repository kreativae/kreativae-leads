"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, LocateFixed, MapPin, Search } from "lucide-react";
import type { Map as LeafletMap, Circle, Marker } from "leaflet";

export interface MapPoint {
  lat: number;
  lon: number;
  label?: string;
}

interface GeoHit {
  label: string;
  lat: number;
  lon: number;
  kind: string | null;
}

const QUICK_SPOTS: { label: string; lat: number; lon: number }[] = [
  { label: "Centro de Londrina", lat: -23.3103, lon: -51.1628 },
  { label: "Gleba Palhano, Londrina", lat: -23.3357, lon: -51.1863 },
  { label: "Av. Paulista, São Paulo", lat: -23.5614, lon: -46.6559 },
  { label: "Faria Lima, São Paulo", lat: -23.5779, lon: -46.6866 },
  { label: "Baixa, Lisboa", lat: 38.7106, lon: -9.1366 },
  { label: "Boavista, Porto", lat: 41.1579, lon: -8.6291 },
];

export function MapPicker({
  point,
  radiusKm,
  onChange,
}: {
  point: MapPoint | null;
  radiusKm: number;
  onChange: (p: MapPoint) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const circleRef = useRef<Circle | null>(null);
  const onChangeRef = useRef(onChange);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GeoHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const initial = useMemo(
    () => point ?? { lat: -23.3103, lon: -51.1628 },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Init Leaflet once (client-only import)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        center: [initial.lat, initial.lon],
        zoom: 13,
        zoomControl: true,
        attributionControl: true,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);

      const icon = L.divIcon({
        className: "",
        html: `<div style="width:18px;height:18px;border-radius:9999px;background:#d1f64b;border:3px solid #08080b;box-shadow:0 0 0 3px rgba(209,246,75,.35)"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });

      const marker = L.marker([initial.lat, initial.lon], {
        icon,
        draggable: true,
      }).addTo(map);
      const circle = L.circle([initial.lat, initial.lon], {
        radius: radiusKm * 1000,
        color: "#d1f64b",
        weight: 2,
        fillColor: "#d1f64b",
        fillOpacity: 0.1,
      }).addTo(map);

      marker.on("dragend", () => {
        const p = marker.getLatLng();
        circle.setLatLng(p);
        onChangeRef.current({ lat: p.lat, lon: p.lng });
      });
      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        marker.setLatLng(e.latlng);
        circle.setLatLng(e.latlng);
        onChangeRef.current({ lat: e.latlng.lat, lon: e.latlng.lng });
      });

      mapRef.current = map;
      markerRef.current = marker;
      circleRef.current = circle;
      setReady(true);
      setTimeout(() => map.invalidateSize(), 120);
      if (!point) onChangeRef.current({ lat: initial.lat, lon: initial.lon });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep circle radius in sync
  useEffect(() => {
    if (!circleRef.current || !mapRef.current) return;
    circleRef.current.setRadius(radiusKm * 1000);
    mapRef.current.fitBounds(circleRef.current.getBounds(), {
      padding: [24, 24],
      maxZoom: 16,
    });
  }, [radiusKm, ready]);

  // Move map when the point changes externally (search/quick spots)
  useEffect(() => {
    if (!point || !mapRef.current || !markerRef.current || !circleRef.current) return;
    const cur = markerRef.current.getLatLng();
    if (Math.abs(cur.lat - point.lat) < 1e-7 && Math.abs(cur.lng - point.lon) < 1e-7)
      return;
    markerRef.current.setLatLng([point.lat, point.lon]);
    circleRef.current.setLatLng([point.lat, point.lon]);
    mapRef.current.setView([point.lat, point.lon], mapRef.current.getZoom());
  }, [point]);

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (query.trim().length < 3) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`);
      const data = (await res.json()) as { results: GeoHit[] };
      setHits(data.results ?? []);
    } finally {
      setSearching(false);
    }
  }

  function pick(h: { label: string; lat: number; lon: number }) {
    setHits([]);
    setQuery(h.label.split(",").slice(0, 2).join(","));
    onChange({ lat: h.lat, lon: h.lon, label: h.label });
  }

  function locateMe() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 8000 },
    );
  }

  return (
    <div className="space-y-3">
      {/* Address search */}
      <div className="relative">
        <form onSubmit={runSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar endereço, bairro ou ponto de referência…"
              className="w-full rounded-xl border border-white/[0.09] bg-ink py-3 pl-10 pr-4 text-[13.5px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-volt/50"
            />
          </div>
          <button
            type="submit"
            disabled={searching}
            className="rounded-xl border border-white/[0.09] px-4 text-[12.5px] font-semibold text-zinc-300 transition-colors hover:border-volt/40 hover:text-volt disabled:opacity-50"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
          </button>
          <button
            type="button"
            onClick={locateMe}
            title="Usar minha localização"
            className="rounded-xl border border-white/[0.09] px-3 text-zinc-400 transition-colors hover:border-volt/40 hover:text-volt"
          >
            {locating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LocateFixed className="h-4 w-4" />
            )}
          </button>
        </form>
        {hits.length > 0 && (
          <ul className="absolute z-[500] mt-1.5 w-full overflow-hidden rounded-xl border border-white/[0.1] bg-panel shadow-2xl">
            {hits.map((h, i) => (
              <li key={`${h.lat}-${h.lon}-${i}`}>
                <button
                  type="button"
                  onClick={() => pick(h)}
                  className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left text-[12.5px] text-zinc-300 transition-colors hover:bg-volt/[0.08]"
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-volt" />
                  <span className="line-clamp-2">{h.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Quick spots */}
      <div className="flex flex-wrap gap-1.5">
        {QUICK_SPOTS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => pick(s)}
            className="rounded-full border border-white/[0.09] bg-white/[0.02] px-3 py-1.5 text-[11.5px] font-medium text-zinc-400 transition-colors hover:border-volt/40 hover:text-zinc-100"
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Map */}
      <div className="relative overflow-hidden rounded-xl border border-white/[0.09]">
        <div ref={containerRef} className="h-[340px] w-full bg-zinc-900" />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-ink/70">
            <Loader2 className="h-6 w-6 animate-spin text-volt" />
          </div>
        )}
      </div>

      <p className="text-[11.5px] text-zinc-500">
        Clique no mapa ou arraste o marcador para definir o centro da varredura.
        {point && (
          <span className="ml-1 font-mono text-zinc-400">
            {point.lat.toFixed(5)}, {point.lon.toFixed(5)}
          </span>
        )}
      </p>
    </div>
  );
}
