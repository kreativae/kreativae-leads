import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DOMINIO_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

// rdap.org devolve 403 sem um User-Agent de navegador — rejeita o UA padrao
// do fetch do Node (server-to-server), mesmo sem exigir chave nenhuma.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

interface RdapEvent {
  eventAction?: string;
  eventDate?: string;
}

interface RdapLink {
  rel?: string;
  href?: string;
}

interface RdapEntity {
  roles?: string[];
  vcardArray?: unknown;
  links?: RdapLink[];
  entities?: RdapEntity[];
}

interface RdapResponse {
  events?: RdapEvent[];
  entities?: RdapEntity[];
  nameservers?: { ldhName?: string }[];
  status?: string[];
  links?: RdapLink[];
}

/** Extrai um campo (ex.: "fn", "org") do vcardArray de uma entidade RDAP. */
function vcardValor(vcardArray: unknown, campo: string): string | null {
  if (!Array.isArray(vcardArray) || vcardArray[0] !== "vcard" || !Array.isArray(vcardArray[1]))
    return null;
  for (const entrada of vcardArray[1] as unknown[]) {
    if (Array.isArray(entrada) && entrada[0] === campo) {
      const valor = entrada[3];
      if (typeof valor === "string" && valor.trim() && !/redact/i.test(valor)) return valor.trim();
    }
  }
  return null;
}

function dataDoEvento(events: RdapEvent[] | undefined, acao: string): string | null {
  return events?.find((e) => e.eventAction === acao)?.eventDate ?? null;
}

function entidadePorRole(entities: RdapEntity[] | undefined, role: string): RdapEntity | null {
  return entities?.find((e) => e.roles?.includes(role)) ?? null;
}

/**
 * Registros "thin" (ex.: .com/.net via Verisign) não trazem o contato do
 * titular na resposta do gTLD — o link "related" no nível raiz do objeto
 * (não dentro da entidade do registrador) aponta pro RDAP completo, no
 * registrador. Segue esse link uma vez, best-effort, pra tentar completar.
 */
async function seguirLinkRelacionado(links: RdapLink[] | undefined): Promise<RdapResponse | null> {
  const link = links?.find((l) => l.rel === "related" && typeof l.href === "string");
  if (!link?.href) return null;
  try {
    const res = await fetch(link.href, {
      headers: { Accept: "application/rdap+json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as RdapResponse;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const sp = new URL(req.url).searchParams;
  const dominio = (sp.get("domain") ?? "").trim().toLowerCase();
  if (!dominio || !DOMINIO_REGEX.test(dominio))
    return NextResponse.json(
      { ok: false, error: "Domínio inválido — use o formato seudominio.com.br." },
      { status: 400 },
    );

  let res: Response;
  try {
    // rdap.org e o bootstrap publico da IANA: acha e redireciona pro
    // servidor RDAP correto do TLD, sem a gente precisar mapear cada um.
    res = await fetch(`https://rdap.org/domain/${encodeURIComponent(dominio)}`, {
      headers: { Accept: "application/rdap+json", "User-Agent": USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Sem conexão com o serviço de RDAP." },
      { status: 502 },
    );
  }

  if (res.status === 404) {
    // rdap.org faz bootstrap: se o TLD nao tem servidor RDAP cadastrado na
    // IANA (ex.: .ae, .pt), ele mesmo devolve 404 sem redirecionar pra
    // lugar nenhum — isso NAO significa que o dominio esta livre, so que
    // essa consulta nao da pra fazer. So conta como "disponivel" o 404 que
    // veio de dentro do proprio registro, depois de sair do rdap.org.
    if (new URL(res.url).host === "rdap.org") {
      return NextResponse.json(
        {
          ok: false,
          error: `O registro desse TLD não tem servidor RDAP público — não dá pra checar "${dominio}" por aqui (isso acontece com alguns TLDs, ex.: .ae).`,
        },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, result: { domain: dominio, disponivel: true } });
  }
  if (!res.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: `Não foi possível consultar esse domínio (esse TLD pode não ter RDAP público — resposta ${res.status}).`,
      },
      { status: 502 },
    );
  }

  let data: RdapResponse;
  try {
    data = (await res.json()) as RdapResponse;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Resposta inesperada do serviço de RDAP." },
      { status: 502 },
    );
  }

  const registrarEnt = entidadePorRole(data.entities, "registrar");
  let registrantEnt = entidadePorRole(data.entities, "registrant");

  // Sem contato do titular na resposta direta? Tenta o RDAP completo, no
  // registrador (link "related" no nível raiz — comum em .com/.net).
  if (!registrantEnt) {
    const extra = await seguirLinkRelacionado(data.links);
    if (extra) {
      registrantEnt = entidadePorRole(extra.entities, "registrant") ?? registrantEnt;
    }
  }

  return NextResponse.json({
    ok: true,
    result: {
      domain: dominio,
      disponivel: false,
      registrar: vcardValor(registrarEnt?.vcardArray, "fn"),
      criadoEm: dataDoEvento(data.events, "registration"),
      expiraEm: dataDoEvento(data.events, "expiration"),
      atualizadoEm: dataDoEvento(data.events, "last changed"),
      status: data.status ?? [],
      nameservers: data.nameservers
        ?.map((n) => n.ldhName)
        .filter((n): n is string => !!n),
      proprietario: registrantEnt ? vcardValor(registrantEnt.vcardArray, "fn") : null,
      organizacao: registrantEnt ? vcardValor(registrantEnt.vcardArray, "org") : null,
    },
  });
}
