"use client";

import { motion } from "framer-motion";

export function BarsChart({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  // Barras em CSS em vez de SVG com viewBox: num viewBox escalado por w-full,
  // no celular os rotulos encolhiam junto e ficavam com ~6px reais.
  const H = 118;

  return (
    <div>
      <div className="flex items-end gap-[3px] sm:gap-2" style={{ height: H }}>
        {data.map((d, i) => {
          const h = Math.max(
            d.value > 0 ? 6 : 2,
            Math.round((d.value / max) * (H - 20)),
          );
          return (
            <div
              key={d.label}
              className="flex min-w-0 flex-1 flex-col items-center justify-end"
            >
              {d.value > 0 && (
                <span className="mb-1 text-[10px] font-semibold leading-none tabular-nums text-zinc-400">
                  {d.value}
                </span>
              )}
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: h, opacity: 1 }}
                transition={{
                  delay: i * 0.03,
                  duration: 0.7,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className={`w-full rounded-t-[5px] ${
                  d.value > 0 ? "bg-volt/90" : "bg-zinc-800/50"
                }`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[3px] sm:gap-2">
        {data.map((d, i) => (
          <span
            key={d.label}
            /* invisible (e nao hidden) para o rotulo continuar ocupando a
               coluna e manter o alinhamento com a barra correspondente. */
            className={`min-w-0 flex-1 text-center text-[9.5px] leading-none text-zinc-600 ${
              i % 2 === 1 ? "invisible sm:visible" : ""
            }`}
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

const FUNNEL_COLORS = [
  "bg-volt",
  "bg-violet-300",
  "bg-sky-400",
  "bg-amber-300",
  "bg-emerald-400",
  "bg-zinc-600",
];

export function FunnelChart({
  steps,
}: {
  steps: { label: string; value: number }[];
}) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <div key={s.label}>
          <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
            <span className="text-zinc-400">{s.label}</span>
            <span className="font-semibold tabular-nums text-zinc-200">
              {s.value.toLocaleString("pt-BR")}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.04]">
            <motion.div
              className={`h-full rounded-full ${FUNNEL_COLORS[i % FUNNEL_COLORS.length]}`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(3, (s.value / max) * 100)}%` }}
              transition={{ delay: 0.15 + i * 0.08, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ScoreDial({
  score,
  size = 132,
}: {
  score: number;
  size?: number;
}) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color =
    score >= 70 ? "#34d399" : score >= 40 ? "#fcd34d" : "#fb7185";
  const label =
    score >= 70 ? "Moderno" : score >= 40 ? "Desatualizado" : "Crítico";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (score / 100) * c }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="font-display text-3xl font-bold tabular-nums" style={{ color }}>
          {score}
        </div>
        <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
          {label}
        </div>
      </div>
    </div>
  );
}
