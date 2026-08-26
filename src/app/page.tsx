import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { leads, searches } from "@/db/schema";
import { count, desc, eq, gte, isNotNull, and } from "drizzle-orm";
import {
  ArrowRight,
  Crosshair,
  Flame,
  Globe2,
  MessageCircle,
  Radar,
  Users,
} from "lucide-react";
import { CountUp } from "@/components/count-up";
import { BarsChart, FunnelChart } from "@/components/charts";
import { OpportunityBadge } from "@/components/badges";
import { LEAD_STATUSES } from "@/lib/constants";
import { timeAgo } from "@/lib/format";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 md:p-6 ${className}`}
    >
      {children}
    </div>
  );
}

export default async function DashboardPage() {
  // O middleware (Edge) só consegue checar a presença do cookie; a validação
  // real da sessão precisa acontecer aqui, antes de qualquer consulta ao banco.
  if (!(await getSessionUser())) redirect("/login?next=/");

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const [
    totalRows,
    noSiteRows,
    whatsRows,
    wonRows,
    recentDates,
    statusGroups,
    lastSearches,
    hotLeads,
  ] = await Promise.all([
    db.select({ n: count() }).from(leads),
    db.select({ n: count() }).from(leads).where(eq(leads.opportunity, "no_website")),
    db.select({ n: count() }).from(leads).where(isNotNull(leads.whatsapp)),
    db.select({ n: count() }).from(leads).where(eq(leads.status, "won")),
    db.select({ d: leads.createdAt }).from(leads).where(gte(leads.createdAt, since)),
    db.select({ status: leads.status, n: count() }).from(leads).groupBy(leads.status),
    db.select().from(searches).orderBy(desc(searches.createdAt)).limit(6),
    db
      .select()
      .from(leads)
      .where(and(eq(leads.opportunity, "no_website"), isNotNull(leads.whatsapp)))
      .orderBy(desc(leads.createdAt))
      .limit(6),
  ]);

  const total = totalRows[0]?.n ?? 0;
  const noSite = noSiteRows[0]?.n ?? 0;
  const withWhats = whatsRows[0]?.n ?? 0;
  const won = wonRows[0]?.n ?? 0;

  // Build 14-day series
  const dayMap = new Map<string, number>();
  for (const r of recentDates) {
    const key = r.d.toISOString().slice(0, 10);
    dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
  }
  const series: { label: string; value: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    series.push({
      label: `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      value: dayMap.get(key) ?? 0,
    });
  }

  const statusCount = new Map(statusGroups.map((g) => [g.status, g.n]));
  const funnel = LEAD_STATUSES.map((s) => ({
    label: s.label,
    value: statusCount.get(s.key) ?? 0,
  }));

  const stats = [
    { label: "Leads capturados", value: total, icon: Users, tone: "text-volt" },
    { label: "Sem site (quentes)", value: noSite, icon: Flame, tone: "text-rose-300" },
    { label: "Com WhatsApp", value: withWhats, icon: MessageCircle, tone: "text-emerald-300" },
    { label: "Negócios fechados", value: won, icon: Crosshair, tone: "text-sky-300" },
  ];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-volt/25 bg-volt/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-volt">
            <Radar className="h-3.5 w-3.5" />
            Sistema interno
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight text-white md:text-5xl text-balance">
            Radar de Leads
          </h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-zinc-400">
            Encontre empresas <span className="text-zinc-200">sem site</span> ou com
            sites <span className="text-zinc-200">desatualizados</span>, com telefone e
            WhatsApp prontos para a abordagem.
          </p>
        </div>
        <Link
          href="/buscar"
          className="group inline-flex items-center gap-2.5 rounded-full bg-volt px-6 py-3.5 text-[14px] font-bold text-onvolt transition-transform hover:scale-[1.03] active:scale-[0.98]"
        >
          <Crosshair className="h-4 w-4" />
          Iniciar nova busca
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-zinc-500">{s.label}</span>
              <s.icon className={`h-4 w-4 ${s.tone}`} strokeWidth={2.2} />
            </div>
            <div className="mt-3 font-display text-4xl font-bold tracking-tight text-white md:text-[44px]">
              <CountUp value={s.value} />
            </div>
            {s.label === "Leads capturados" && total > 0 && (
              <div className="mt-1 text-[11.5px] text-zinc-500">
                {Math.round((noSite / Math.max(1, total)) * 100)}% sem site próprio
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-[15px] font-semibold text-white">
              Captações — últimos 14 dias
            </h2>
            <Globe2 className="h-4 w-4 text-zinc-600" />
          </div>
          <BarsChart data={series} />
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="mb-5 font-display text-[15px] font-semibold text-white">
            Pipeline comercial
          </h2>
          <FunnelChart steps={funnel} />
        </Card>
      </div>

      {/* Lists */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-[15px] font-semibold text-white">
              Últimas pesquisas
            </h2>
            <Link
              href="/pesquisas"
              className="text-[12px] font-medium text-volt hover:underline"
            >
              Ver todas
            </Link>
          </div>
          {lastSearches.length === 0 ? (
            <EmptyState text="Nenhuma pesquisa ainda. Inicie a primeira varredura." />
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {lastSearches.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-3">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      s.status === "done"
                        ? "bg-volt"
                        : s.status === "failed"
                          ? "bg-rose-400"
                          : "animate-pulse bg-amber-300"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold text-zinc-100">
                      {s.segment}
                      <span className="font-normal text-zinc-500">
                        {" "}
                        · {s.city}
                        {s.country === "PT" ? " · PT" : s.state ? ` · ${s.state}` : ""}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-zinc-500">
                      {timeAgo(s.createdAt)} · {s.newCount} novos de {s.resultsCount}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-lg font-bold tabular-nums text-white">
                      {s.resultsCount}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-600">
                      achados
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-[15px] font-semibold text-white">
              Leads quentes — sem site + WhatsApp
            </h2>
            <Link
              href="/leads?oportunidade=no_website"
              className="text-[12px] font-medium text-volt hover:underline"
            >
              Abrir CRM
            </Link>
          </div>
          {hotLeads.length === 0 ? (
            <EmptyState text="Os leads quentes aparecerão aqui após a primeira busca." />
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {hotLeads.map((l) => (
                <li key={l.id} className="flex items-center gap-3 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] font-display text-[13px] font-bold text-volt">
                    {l.companyName.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold text-zinc-100">
                      {l.companyName}
                    </div>
                    <div className="mt-0.5 truncate text-[11.5px] text-zinc-500">
                      {l.segment} · {l.city ?? "—"}
                    </div>
                  </div>
                  <OpportunityBadge opportunity={l.opportunity} />
                  {l.whatsapp && (
                    <a
                      href={`https://wa.me/${l.whatsapp}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Abrir WhatsApp"
                      className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-2 text-emerald-300 transition-colors hover:bg-emerald-400/20"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/[0.08] px-4 py-8 text-center text-[13px] text-zinc-500">
      {text}
    </div>
  );
}
