import { LEAD_STATUSES } from "@/lib/constants";

const STATUS_STYLES: Record<string, string> = {
  new: "border-volt/30 bg-volt/10 text-volt",
  scheduled: "border-violet-300/30 bg-violet-300/10 text-violet-300",
  contacted: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  negotiating: "border-amber-300/30 bg-amber-300/10 text-amber-300",
  won: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  lost: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
};

export function statusLabel(key: string): string {
  return LEAD_STATUSES.find((s) => s.key === key)?.label ?? key;
}

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
        STATUS_STYLES[status] ?? STATUS_STYLES.new
      }`}
    >
      {statusLabel(status)}
    </span>
  );
}

export function OpportunityBadge({
  opportunity,
  score,
}: {
  opportunity: string;
  score?: number | null;
}) {
  if (opportunity === "no_website")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-400/10 px-2.5 py-0.5 text-[11px] font-semibold text-rose-300">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
        Sem site
      </span>
    );
  if (opportunity === "outdated")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
        Site: {typeof score === "number" ? `${score}/100` : "desatualizado"}
      </span>
    );
  if (opportunity === "modern")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
        Site ok{typeof score === "number" ? ` · ${score}/100` : ""}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-medium text-zinc-400">
      Site a analisar
    </span>
  );
}
