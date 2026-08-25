"use client";

import { motion } from "framer-motion";

export function BarsChart({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const W = 560;
  const H = 150;
  const gap = 10;
  const bw = (W - gap * (data.length - 1)) / data.length;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {data.map((d, i) => {
          const h = Math.max(d.value > 0 ? 8 : 2, (d.value / max) * (H - 34));
          return (
            <g key={d.label}>
              <motion.rect
                x={i * (bw + gap)}
                width={bw}
                rx={5}
                initial={{ y: H - 20, height: 0, opacity: 0 }}
                animate={{ y: H - 20 - h, height: h, opacity: 1 }}
                transition={{ delay: i * 0.03, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className={d.value > 0 ? "fill-volt" : "fill-zinc-800"}
                opacity={d.value > 0 ? 0.9 : 0.5}
              />
              <text
                x={i * (bw + gap) + bw / 2}
                y={H - 6}
                textAnchor="middle"
                className="fill-zinc-600 text-[9.5px]"
              >
                {d.label}
              </text>
              {d.value > 0 && (
                <text
                  x={i * (bw + gap) + bw / 2}
                  y={H - 26 - h}
                  textAnchor="middle"
                  className="fill-zinc-400 text-[10px] font-semibold tabular-nums"
                >
                  {d.value}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const FUNNEL_COLORS = [
  "bg-volt",
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
