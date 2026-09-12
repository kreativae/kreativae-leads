import { listWaAccounts } from "@/lib/settings-db";

const GRAPH_VERSION = "v21.0";

interface ConversationDataPoint {
  conversation?: number;
  cost?: number;
}
interface ConversationAnalyticsResponse {
  conversation_analytics?: { data?: { data_points?: ConversationDataPoint[] }[] };
  error?: { message?: string };
}

export interface CustoWhatsAppConta {
  accountId: string;
  label: string;
  displayPhone: string | null;
  ok: boolean;
  erro?: string;
  conversas: number;
  custo: number;
}

export interface CustoWhatsApp {
  contas: CustoWhatsAppConta[];
  totalConversas: number;
  totalCusto: number;
  periodoDias: number;
  desde: string;
  ate: string;
}

/**
 * Custo real de conversas do WhatsApp, direto da Meta (endpoint
 * conversation_analytics da WABA) — nao e estimativa local como o Places,
 * porque a Meta cobra por CONVERSA (categoria/pais variam de preco), nao por
 * chamada de API. So contas com wabaId cadastrado entram na conta; contas
 * sem WABA valido (ex.: numero de teste) ficam marcadas com erro, sem
 * quebrar o total das demais.
 */
export async function lerCustoWhatsApp(periodoDias = 30): Promise<CustoWhatsApp> {
  const agora = Math.floor(Date.now() / 1000);
  const inicio = agora - periodoDias * 86400;
  const contas = await listWaAccounts();

  const resultados = await Promise.all(
    contas
      .filter((c) => !!c.wabaId)
      .map(async (c): Promise<CustoWhatsAppConta> => {
        const fields =
          `conversation_analytics.start(${inicio}).end(${agora}).granularity(DAILY)` +
          `.dimensions(["conversation_category"])`;
        const url =
          `https://graph.facebook.com/${GRAPH_VERSION}/${c.wabaId}` +
          `?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(c.accessToken)}`;
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
          const data = (await res.json().catch(() => ({}))) as ConversationAnalyticsResponse;
          if (data.error) {
            return {
              accountId: c.id,
              label: c.label,
              displayPhone: c.displayPhone,
              ok: false,
              erro: data.error.message ?? `HTTP ${res.status}`,
              conversas: 0,
              custo: 0,
            };
          }
          const pontos = data.conversation_analytics?.data?.flatMap((d) => d.data_points ?? []) ?? [];
          const conversas = pontos.reduce((acc, p) => acc + (p.conversation ?? 0), 0);
          const custo = pontos.reduce((acc, p) => acc + (p.cost ?? 0), 0);
          return {
            accountId: c.id,
            label: c.label,
            displayPhone: c.displayPhone,
            ok: true,
            conversas,
            custo: Math.round(custo * 100) / 100,
          };
        } catch {
          return {
            accountId: c.id,
            label: c.label,
            displayPhone: c.displayPhone,
            ok: false,
            erro: "Sem conexão com o servidor da Meta.",
            conversas: 0,
            custo: 0,
          };
        }
      }),
  );

  const semWaba: CustoWhatsAppConta[] = contas
    .filter((c) => !c.wabaId)
    .map((c) => ({
      accountId: c.id,
      label: c.label,
      displayPhone: c.displayPhone,
      ok: false,
      erro: "Sem WABA ID cadastrado — não é possível consultar analytics.",
      conversas: 0,
      custo: 0,
    }));

  const todasContas = [...resultados, ...semWaba];
  return {
    contas: todasContas,
    totalConversas: resultados.reduce((acc, c) => acc + c.conversas, 0),
    totalCusto: Math.round(resultados.reduce((acc, c) => acc + c.custo, 0) * 100) / 100,
    periodoDias,
    desde: new Date(inicio * 1000).toISOString(),
    ate: new Date(agora * 1000).toISOString(),
  };
}
