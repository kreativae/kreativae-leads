"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Brain,
  Building2,
  Calculator,
  CheckCircle2,
  Crosshair,
  Dumbbell,
  Globe2,
  HardHat,
  HeartPulse,
  Loader2,
  MapPin,
  MessageCircle,
  PawPrint,
  Radius,
  RotateCcw,
  Ruler,
  Scale,
  Scissors,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UtensilsCrossed,
  XCircle,
} from "lucide-react";
import dynamicImport from "next/dynamic";
import { CITY_PRESETS, SEGMENT_PRESETS } from "@/lib/constants";
import { formatPhone } from "@/lib/phone";
import type { MapPoint } from "@/components/map-picker";

const MapPicker = dynamicImport(
  () => import("@/components/map-picker").then((m) => m.MapPicker),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[340px] items-center justify-center rounded-xl border border-white/[0.09] bg-white/[0.02]">
        <Loader2 className="h-6 w-6 animate-spin text-volt" />
      </div>
    ),
  },
);

const RADIUS_STEPS = [1, 2, 3, 5, 10, 15, 25, 50];

const SEGMENT_ICONS: Record<string, typeof Scale> = {
  advogados: Scale,
  arquitetos: Ruler,
  dentistas: Stethoscope,
  medicos: HeartPulse,
  "clinicas-estetica": Sparkles,
  psicologos: Brain,
  contadores: Calculator,
  imobiliarias: Building2,
  engenharia: HardHat,
  seguros: ShieldCheck,
  academias: Dumbbell,
  pet: PawPrint,
  restaurantes: UtensilsCrossed,
  saloes: Scissors,
};

const LOAD_STEPS = [
  "Geocodificando a cidade alvo…",
  "Varrendo o OpenStreetMap…",
  "Filtrando telefones e WhatsApp…",
  "Detectando empresas sem site…",
  "Registrando no radar…",
];

interface LeadPreview {
  id: string;
  companyName: string;
  city: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
}

interface SearchSummary {
  id: string;
  segment: string;
  city: string;
  state: string | null;
  country: string;
  source?: string;
  resultsCount: number;
  newCount: number;
  withPhoneCount: number;
  withWhatsappCount: number;
  noWebsiteCount: number;
  durationMs: number;
}

type Phase = "idle" | "running" | "done" | "error";

function SearchForm() {
  const sp = useSearchParams();
  const [segment, setSegment] = useState(sp.get("segmento") ?? "");
  const [country, setCountry] = useState<"BR" | "PT">(
    sp.get("pais") === "PT" ? "PT" : "BR",
  );
  const [city, setCity] = useState(sp.get("cidade") ?? "");
  const [mode, setMode] = useState<"city" | "radius">("city");
  const [point, setPoint] = useState<MapPoint | null>(null);
  const [radiusKm, setRadiusKm] = useState(5);
  const [limit, setLimit] = useState(80);
  const [phase, setPhase] = useState<Phase>("idle");
  const [stepIdx, setStepIdx] = useState(0);
  const [summary, setSummary] = useState<SearchSummary | null>(null);
  const [preview, setPreview] = useState<LeadPreview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const cityOptions = useMemo(
    () => CITY_PRESETS.filter((c) => c.country === country),
    [country],
  );

  useEffect(() => {
    return () => {
      if (stepTimer.current) clearInterval(stepTimer.current);
    };
  }, []);

  async function runSearch() {
    if (!segment.trim()) return;
    if (mode === "city" && !city.trim()) return;
    if (mode === "radius" && !point) return;
    setPhase("running");
    setError(null);
    setSummary(null);
    setStepIdx(0);
    stepTimer.current = setInterval(
      () => setStepIdx((i) => Math.min(i + 1, LOAD_STEPS.length - 1)),
      2600,
    );
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segment: segment.trim(),
          country,
          limit,
          mode,
          ...(mode === "city"
            ? { city: city.trim() }
            : { lat: point?.lat, lon: point?.lon, radiusKm }),
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        search?: SearchSummary;
        leads?: LeadPreview[];
      };
      if (!data.ok) throw new Error(data.error ?? "Falha na busca.");
      setSummary(data.search ?? null);
      setPreview(data.leads ?? []);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
      setPhase("error");
    } finally {
      if (stepTimer.current) clearInterval(stepTimer.current);
    }
  }

  function reset() {
    setPhase("idle");
    setSummary(null);
    setPreview([]);
    setError(null);
  }

  const ready =
    segment.trim().length >= 2 &&
    (mode === "city" ? city.trim().length >= 2 : !!point);

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-volt/25 bg-volt/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-volt">
          <Crosshair className="h-3.5 w-3.5" />
          Nova varredura
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
          Buscar novos leads
        </h1>
        <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-zinc-400">
          Escolha o segmento e a região. O radar varre a internet, registra em{" "}
          <span className="text-zinc-200">Últimas pesquisas</span> e já destaca quem{" "}
          <span className="text-rose-300">não tem site</span> e quem tem{" "}
          <span className="text-emerald-300">WhatsApp</span>.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {phase === "idle" && (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-7 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 md:p-8"
          >
            {/* Step 1 — segment */}
            <section>
              <StepHeader n="01" title="Segmento" hint="O que você quer caçar hoje?" />
              <div className="mt-4 flex flex-wrap gap-2">
                {SEGMENT_PRESETS.map((s) => {
                  const Icon = SEGMENT_ICONS[s.key] ?? Crosshair;
                  const active = segment === s.label;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setSegment(active ? "" : s.label)}
                      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[13px] font-semibold transition-all ${
                        active
                          ? "border-volt bg-volt text-onvolt"
                          : "border-white/[0.09] bg-white/[0.02] text-zinc-400 hover:border-volt/40 hover:text-zinc-100"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {s.label}
                    </button>
                  );
                })}
              </div>
              <input
                value={SEGMENT_PRESETS.some((s) => s.label === segment) ? "" : segment}
                onChange={(e) => setSegment(e.target.value)}
                placeholder="Ou digite outro segmento… ex.: Escritórios de contabilidade"
                className="mt-4 w-full max-w-xl rounded-xl border border-white/[0.09] bg-ink px-4 py-3 text-[13.5px] text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-volt/50"
              />
            </section>

            <div className="h-px bg-white/[0.06]" />

            {/* Step 2 — region */}
            <section>
              <StepHeader
                n="02"
                title="Região"
                hint="Por cidade inteira ou por raio no mapa"
              />

              {/* Mode tabs */}
              <div className="mt-4 inline-flex rounded-full border border-white/[0.09] bg-ink p-1">
                {(
                  [
                    { key: "city", label: "Cidade inteira", icon: Building2 },
                    { key: "radius", label: "Raio no mapa", icon: Radius },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMode(m.key)}
                    className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-[12.5px] font-bold transition-all ${
                      mode === m.key
                        ? "bg-volt text-onvolt"
                        : "text-zinc-500 hover:text-zinc-200"
                    }`}
                  >
                    <m.icon className="h-3.5 w-3.5" />
                    {m.label}
                  </button>
                ))}
              </div>

              {mode === "city" ? (
                <div className="mt-4">
                  <div className="inline-flex rounded-full border border-white/[0.09] bg-ink p-1">
                    {(["BR", "PT"] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCountry(c)}
                        className={`rounded-full px-5 py-2 text-[12.5px] font-bold transition-all ${
                          country === c
                            ? "bg-volt text-onvolt"
                            : "text-zinc-500 hover:text-zinc-200"
                        }`}
                      >
                        {c === "BR" ? "Brasil" : "Portugal"}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {cityOptions.map((c) => {
                      const active = city === c.label;
                      return (
                        <button
                          key={c.label}
                          type="button"
                          onClick={() => setCity(active ? "" : c.label)}
                          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[13px] font-semibold transition-all ${
                            active
                              ? "border-volt bg-volt text-onvolt"
                              : "border-white/[0.09] bg-white/[0.02] text-zinc-400 hover:border-volt/40 hover:text-zinc-100"
                          }`}
                        >
                          <MapPin className="h-3.5 w-3.5" />
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    value={CITY_PRESETS.some((c) => c.label === city) ? "" : city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder={
                      country === "PT"
                        ? "Ou digite outra cidade… ex.: Braga, Portugal"
                        : "Ou digite outra cidade… ex.: Apucarana, PR"
                    }
                    className="mt-4 w-full max-w-xl rounded-xl border border-white/[0.09] bg-ink px-4 py-3 text-[13.5px] text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-volt/50"
                  />
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <MapPicker point={point} radiusKm={radiusKm} onChange={setPoint} />

                  <div>
                    <div className="flex items-baseline justify-between">
                      <label className="text-[12.5px] font-semibold text-zinc-300">
                        Raio de varredura
                      </label>
                      <span className="font-display text-lg font-bold tabular-nums text-volt">
                        {radiusKm} km
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={RADIUS_STEPS.length - 1}
                      step={1}
                      value={RADIUS_STEPS.indexOf(radiusKm)}
                      onChange={(e) =>
                        setRadiusKm(RADIUS_STEPS[Number(e.target.value)])
                      }
                      className="mt-2 w-full accent-[var(--color-volt)]"
                    />
                    <div className="mt-1 flex justify-between text-[10.5px] text-zinc-600">
                      {RADIUS_STEPS.map((r) => (
                        <span key={r}>{r}</span>
                      ))}
                    </div>
                    <p className="mt-2 text-[11.5px] text-zinc-500">
                      Área coberta: ~
                      {(Math.PI * radiusKm * radiusKm).toFixed(
                        radiusKm < 3 ? 1 : 0,
                      )}{" "}
                      km². O país é detectado automaticamente pelo ponto escolhido.
                    </p>
                  </div>
                </div>
              )}
            </section>

            <div className="h-px bg-white/[0.06]" />

            {/* Step 3 — volume */}
            <section>
              <StepHeader n="03" title="Volume" hint="Máximo de empresas por varredura" />
              <div className="mt-4 flex gap-2">
                {[40, 80, 120].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setLimit(n)}
                    className={`rounded-full border px-5 py-2.5 text-[13px] font-bold tabular-nums transition-all ${
                      limit === n
                        ? "border-volt bg-volt text-onvolt"
                        : "border-white/[0.09] bg-white/[0.02] text-zinc-400 hover:text-zinc-100"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </section>

            <button
              type="button"
              disabled={!ready}
              onClick={runSearch}
              className="group inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-volt py-4.5 text-[15px] font-bold text-onvolt transition-all enabled:hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-30 md:w-auto md:px-12"
            >
              <Crosshair className="h-4.5 w-4.5" />
              Iniciar varredura
              <ArrowRight className="h-4.5 w-4.5 transition-transform group-hover:translate-x-1" />
            </button>
          </motion.div>
        )}

        {phase === "running" && (
          <motion.div
            key="running"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 md:p-12"
          >
            <div className="mx-auto max-w-md text-center">
              <div className="relative mx-auto mb-8 h-24 w-24">
                <span className="absolute inset-0 animate-ping rounded-full border border-volt/30" />
                <span className="absolute inset-3 animate-ping rounded-full border border-volt/20 [animation-delay:0.4s]" />
                <span className="absolute inset-0 flex items-center justify-center">
                  <Crosshair className="h-9 w-9 animate-spin text-volt [animation-duration:3s]" />
                </span>
              </div>
              <h2 className="font-display text-xl font-bold text-white">
                {mode === "radius"
                  ? `Varrendo ${radiusKm} km ao redor do ponto…`
                  : `Varrendo ${city}…`}
              </h2>
              <p className="mt-1 text-[13px] text-zinc-500">
                {segment} ·{" "}
                {mode === "radius"
                  ? `${point?.lat.toFixed(4)}, ${point?.lon.toFixed(4)}`
                  : country === "PT"
                    ? "Portugal"
                    : "Brasil"}
              </p>
              <ul className="mt-8 space-y-3 text-left">
                {LOAD_STEPS.map((s, i) => (
                  <motion.li
                    key={s}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: i <= stepIdx ? 1 : 0.25, x: 0 }}
                    className="flex items-center gap-3 text-[13.5px]"
                  >
                    {i < stepIdx ? (
                      <CheckCircle2 className="h-4 w-4 text-volt" />
                    ) : i === stepIdx ? (
                      <Loader2 className="h-4 w-4 animate-spin text-volt" />
                    ) : (
                      <span className="h-4 w-4 rounded-full border border-white/10" />
                    )}
                    <span className={i <= stepIdx ? "text-zinc-200" : "text-zinc-600"}>
                      {s}
                    </span>
                  </motion.li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}

        {phase === "done" && summary && (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-4"
          >
            <div className="rounded-2xl border border-volt/20 bg-volt/[0.04] p-6 md:p-8">
              <div className="flex flex-wrap items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-volt" />
                <h2 className="font-display text-xl font-bold text-white">
                  Varredura concluída — {summary.segment} em {summary.city}
                </h2>
                <span className="rounded-full border border-white/15 bg-white/[0.05] px-3 py-1 text-[11px] font-semibold text-zinc-400">
                  via {summary.source === "places" ? "Google Places" : "OpenStreetMap"}
                </span>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                <SummaryStat label="Empresas achadas" value={summary.resultsCount} />
                <SummaryStat label="Novas no radar" value={summary.newCount} accent />
                <SummaryStat label="Com WhatsApp" value={summary.withWhatsappCount} tone="text-emerald-300" />
                <SummaryStat label="Sem site" value={summary.noWebsiteCount} tone="text-rose-300" />
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/leads"
                  className="inline-flex items-center gap-2 rounded-full bg-volt px-6 py-3 text-[13.5px] font-bold text-onvolt transition-transform hover:scale-[1.03]"
                >
                  Abrir CRM de leads
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-[13.5px] font-semibold text-zinc-300 transition-colors hover:border-volt/40 hover:text-volt"
                >
                  <RotateCcw className="h-4 w-4" />
                  Nova busca
                </button>
              </div>
            </div>

            {preview.length > 0 && (
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 md:p-6">
                <h3 className="mb-4 text-[13px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Amostra dos novos contatos
                </h3>
                <ul className="divide-y divide-white/[0.05]">
                  {preview.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-zinc-100">
                        {l.companyName}
                      </span>
                      <span className="text-[12px] text-zinc-500">{l.city}</span>
                      {l.whatsapp && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                          <MessageCircle className="h-3 w-3" />
                          {formatPhone(l.whatsapp, summary.country) ?? l.whatsapp}
                        </span>
                      )}
                      {!l.website && (
                        <span className="rounded-full border border-rose-400/25 bg-rose-400/10 px-2 py-0.5 text-[11px] font-semibold text-rose-300">
                          Sem site
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}

        {phase === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-rose-400/25 bg-rose-400/[0.05] p-8"
          >
            <div className="flex items-center gap-3">
              <XCircle className="h-6 w-6 text-rose-300" />
              <h2 className="font-display text-lg font-bold text-white">
                A varredura não foi concluída
              </h2>
            </div>
            <p className="mt-3 max-w-xl text-[13.5px] leading-relaxed text-rose-200/80">
              {error}
            </p>
            <p className="mt-2 text-[12.5px] text-zinc-500">
              A tentativa ficou registrada em Últimas pesquisas. Tente novamente em
              alguns instantes ou ajuste a cidade.
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-[13.5px] font-semibold text-zinc-200 transition-colors hover:border-volt/40 hover:text-volt"
            >
              <RotateCcw className="h-4 w-4" />
              Tentar novamente
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-2.5 text-[12px] text-zinc-600">
        <Globe2 className="h-3.5 w-3.5" />
        Dados de empresas via OpenStreetMap/ODbL · análise técnica de sites executada sob demanda no CRM.
      </div>
    </div>
  );
}

function StepHeader({ n, title, hint }: { n: string; title: string; hint: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="font-display text-[13px] font-bold text-volt">{n}</span>
      <h2 className="font-display text-[17px] font-bold text-white">{title}</h2>
      <span className="text-[12.5px] text-zinc-500">{hint}</span>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  accent = false,
  tone = "text-white",
}: {
  label: string;
  value: number;
  accent?: boolean;
  tone?: string;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        accent ? "border-volt/25 bg-volt/[0.06]" : "border-white/[0.07] bg-ink/50"
      }`}
    >
      <div className={`font-display text-3xl font-bold tabular-nums ${tone}`}>
        {value.toLocaleString("pt-BR")}
      </div>
      <div className="mt-1 text-[11.5px] font-medium text-zinc-500">{label}</div>
    </div>
  );
}

export default function BuscarPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-volt" />
        </div>
      }
    >
      <SearchForm />
    </Suspense>
  );
}
