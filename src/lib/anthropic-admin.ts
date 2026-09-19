import { getEffectiveSetting } from "@/lib/settings-db";

interface CostReportResult {
  amount: string;
  currency: string;
}
interface CostReportBucket {
  starting_at: string;
  ending_at: string;
  results: CostReportResult[];
}
interface CostReportResponse {
  data: CostReportBucket[];
  has_more: boolean;
  next_page: string | null;
}

export type GastoMensalAnthropic =
  | { ok: true; totalUsd: number; desde: string; ate: string }
  | { ok: false; error: string };

/**
 * Gasto real do mês corrente, direto da Admin API da Anthropic
 * (/v1/organizations/cost_report) — não é o mesmo tipo de chave da aba IA:
 * essa é uma "Admin API Key" da organização, criada em
 * console.anthropic.com → Organização → Admin API Keys, só por um admin.
 * A chave normal (usada pra análise de anúncio) não tem esse escopo.
 */
export async function lerGastoMensalAnthropic(): Promise<GastoMensalAnthropic> {
  const adminKey = await getEffectiveSetting("anthropic_admin_api_key", "ANTHROPIC_ADMIN_API_KEY");
  if (!adminKey)
    return { ok: false, error: "Admin API Key não configurada." };

  const agora = new Date();
  const inicioMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));

  let total = 0;
  let page: string | undefined;
  let paginas = 0;
  do {
    const sp = new URLSearchParams({ starting_at: inicioMes.toISOString(), limit: "31" });
    if (page) sp.set("page", page);
    let res: Response;
    try {
      res = await fetch(`https://api.anthropic.com/v1/organizations/cost_report?${sp.toString()}`, {
        headers: { "x-api-key": adminKey, "anthropic-version": "2023-06-01" },
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
    } catch {
      return { ok: false, error: "Sem conexão com a API da Anthropic." };
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      return {
        ok: false,
        error: body.error?.message ?? `Anthropic respondeu HTTP ${res.status}.`,
      };
    }
    const data = (await res.json()) as CostReportResponse;
    for (const bucket of data.data) {
      for (const r of bucket.results) total += parseFloat(r.amount) || 0;
    }
    page = data.has_more ? data.next_page ?? undefined : undefined;
    paginas++;
  } while (page && paginas < 5);

  return {
    ok: true,
    totalUsd: Math.round(total * 10_000) / 10_000,
    desde: inicioMes.toISOString(),
    ate: agora.toISOString(),
  };
}
