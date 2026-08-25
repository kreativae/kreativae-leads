export interface SiteCheck {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export interface SiteAnalysis {
  score: number;
  grade: "modern" | "outdated" | "critical";
  checks: SiteCheck[];
  finalUrl: string | null;
  analyzedAt: string;
}

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function tryFetch(url: string): Promise<{ res: Response; html: string } | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xhtml+xml" },
      cache: "no-store",
    });
    const html = (await res.text()).slice(0, 500_000);
    return { res, html };
  } catch {
    return null;
  }
}

export async function analyzeWebsite(rawUrl: string): Promise<SiteAnalysis> {
  let urlStr = rawUrl.trim();
  if (!/^https?:\/\//i.test(urlStr)) urlStr = "https://" + urlStr;

  let attempt = await tryFetch(urlStr);
  if (!attempt && urlStr.startsWith("https://")) {
    attempt = await tryFetch("http://" + urlStr.slice(8));
  }
  if (!attempt && urlStr.startsWith("http://")) {
    attempt = await tryFetch("https://" + urlStr.slice(7));
  }

  if (!attempt) {
    return {
      score: 5,
      grade: "critical",
      checks: [
        {
          id: "reachable",
          label: "Site no ar",
          status: "fail",
          detail: "O site não respondeu — fora do ar ou domínio expirado.",
        },
      ],
      finalUrl: null,
      analyzedAt: new Date().toISOString(),
    };
  }

  const { res, html } = attempt;
  const finalUrl = res.url;
  const lower = html.toLowerCase();
  const checks: SiteCheck[] = [];
  let penalty = 0;

  const push = (check: SiteCheck, weight: number) => {
    checks.push(check);
    if (check.status === "fail") penalty += weight;
    else if (check.status === "warn") penalty += Math.round(weight * 0.35);
  };

  const isHttps = finalUrl.startsWith("https://");
  push(
    {
      id: "https",
      label: "Conexão segura (HTTPS)",
      status: isHttps ? "pass" : "fail",
      detail: isHttps
        ? "Certificado SSL ativo."
        : "Sem HTTPS — navegadores marcam como 'não seguro'.",
    },
    22,
  );

  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  push(
    {
      id: "responsive",
      label: "Versão mobile (responsivo)",
      status: hasViewport ? "pass" : "fail",
      detail: hasViewport
        ? "Meta viewport presente — adaptável a celulares."
        : "Sem meta viewport — provavelmente quebrado no celular (60%+ do tráfego).",
    },
    24,
  );

  const hasDoctype = /<!doctype html>/i.test(html.slice(0, 500));
  if (!hasDoctype)
    push(
      {
        id: "doctype",
        label: "HTML moderno",
        status: "warn",
        detail: "Doctype antigo ou ausente — página construída com padrões antigos.",
      },
      10,
    );

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  push(
    {
      id: "title",
      label: "Título otimizado",
      status: titleMatch && titleMatch[1].trim().length >= 8 ? "pass" : "warn",
      detail:
        titleMatch && titleMatch[1].trim().length >= 8
          ? "Tag title presente."
          : "Title ausente ou fraco — prejudica o ranqueamento no Google.",
    },
    8,
  );

  const hasDescription = /<meta[^>]+name=["']description["']/i.test(html);
  push(
    {
      id: "description",
      label: "Meta description (SEO)",
      status: hasDescription ? "pass" : "warn",
      detail: hasDescription
        ? "Descrição para o Google presente."
        : "Sem meta description — Google exibe texto aleatório.",
    },
    8,
  );

  const hasFlash = /\.swf|<applet|application\/x-shockwave/i.test(html);
  if (hasFlash)
    push(
      {
        id: "flash",
        label: "Tecnologia obsoleta",
        status: "fail",
        detail: "Usa Flash/Applets — tecnologia morta, não abre em nenhum navegador moderno.",
      },
      30,
    );

  const tableCount = (lower.match(/<table/g) ?? []).length;
  if (tableCount >= 2)
    push(
      {
        id: "tables",
        label: "Layout em tabelas",
        status: "warn",
        detail: `${tableCount} tabelas detectadas — indício de layout dos anos 2000.`,
      },
      12,
    );

  const currentYear = new Date().getFullYear();
  const years = (html.match(/\b(19\d{2}|20[0-3]\d)\b/g) ?? [])
    .map(Number)
    .filter((y) => y >= 1998 && y <= currentYear);
  const maxYear = years.length ? Math.max(...years) : null;
  if (maxYear !== null && maxYear <= currentYear - 3)
    push(
      {
        id: "freshness",
        label: "Atualização recente",
        status: "fail",
        detail: `Nada datado após ${maxYear} — site aparentemente abandonado há ${currentYear - maxYear}+ anos.`,
      },
      18,
    );
  else if (maxYear !== null && maxYear <= currentYear - 2)
    push(
      {
        id: "freshness",
        label: "Atualização recente",
        status: "warn",
        detail: `Última referência datada em ${maxYear}.`,
      },
      10,
    );
  else
    push(
      {
        id: "freshness",
        label: "Atualização recente",
        status: "pass",
        detail: maxYear ? `Conteúdo com referência a ${maxYear}.` : "Sem indícios de abandono.",
      },
      0,
    );

  const hasCharset = /charset=["']?utf-?8/i.test(html);
  if (!hasCharset)
    push(
      {
        id: "charset",
        label: "Codificação UTF-8",
        status: "warn",
        detail: "Charset antigo — acentos podem quebrar.",
      },
      6,
    );

  const hasOg = /property=["']og:/i.test(html);
  push(
    {
      id: "social",
      label: "Otimizado para redes sociais",
      status: hasOg ? "pass" : "warn",
      detail: hasOg
        ? "Open Graph configurado."
        : "Sem Open Graph — compartilhamentos no WhatsApp/Facebook ficam sem imagem.",
    },
    6,
  );

  const genMatch = html.match(
    /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']{1,60})/i,
  );
  if (genMatch)
    checks.push({
      id: "generator",
      label: "Plataforma detectada",
      status: "warn",
      detail: `Construído com: ${genMatch[1]}.`,
    });

  const score = Math.max(3, Math.min(100, 100 - penalty));
  let grade: SiteAnalysis["grade"] =
    score >= 70 ? "modern" : score >= 40 ? "outdated" : "critical";
  const hasCriticalFail = checks.some(
    (c) =>
      c.status === "fail" &&
      (c.id === "https" || c.id === "responsive" || c.id === "flash"),
  );
  if (hasCriticalFail && grade === "modern") grade = "outdated";

  return { score, grade, checks, finalUrl, analyzedAt: new Date().toISOString() };
}
