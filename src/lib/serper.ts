import type { ResultadoBusca } from "@/lib/dork-extract";

/**
 * Busca no Google via Serper.dev. A API oficial do Google (Custom Search
 * JSON API) fechou pra clientes novos e desliga em 01/01/2027, e raspar o
 * Google direto é bloqueado com CAPTCHA — por isso um serviço intermediário.
 *
 * SERPER_API_URL só existe pra apontar pra um servidor falso em teste local.
 */
const URL_SERPER = process.env.SERPER_API_URL || "https://google.serper.dev/search";

export type ResultadoSerper =
  | { ok: true; resultados: ResultadoBusca[] }
  | { ok: false; error: string; status: number };

export async function buscarNoGoogle(opts: {
  q: string;
  pagina: number;
  apiKey: string;
}): Promise<ResultadoSerper> {
  let res: Response;
  try {
    res = await fetch(URL_SERPER, {
      method: "POST",
      headers: { "X-API-KEY": opts.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: opts.q, gl: "br", hl: "pt-br", num: 10, page: opts.pagina }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Não foi possível falar com o Serper agora.", status: 502 };
  }

  if (!res.ok) {
    const corpo = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403)
      return { ok: false, error: "Chave do Serper inválida — confira em Configurações.", status: 401 };
    if (/credit/i.test(corpo))
      return { ok: false, error: "Acabaram os créditos do Serper — recarregue em serper.dev.", status: 402 };
    if (res.status === 429)
      return { ok: false, error: "Muitas buscas seguidas — espere alguns segundos.", status: 429 };
    return { ok: false, error: `Serper respondeu ${res.status}.`, status: 502 };
  }

  const data = (await res.json().catch(() => null)) as {
    organic?: { title?: unknown; link?: unknown; snippet?: unknown }[];
  } | null;
  const resultados = (data?.organic ?? [])
    .filter((o) => typeof o.link === "string" && typeof o.title === "string")
    .map((o) => ({
      title: o.title as string,
      link: o.link as string,
      snippet: typeof o.snippet === "string" ? o.snippet : "",
    }));
  return { ok: true, resultados };
}
