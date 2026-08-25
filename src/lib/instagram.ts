const GRAPH_VERSION = "v21.0";

export interface IgProfile {
  username: string;
  name: string | null;
  biography: string | null;
  website: string | null;
  followersCount: number | null;
  mediaCount: number | null;
}

export type IgFailure =
  | "not_business" // perfil pessoal ou inexistente — a API so enxerga Business/Creator
  | "auth" // token invalido, expirado ou sem permissao
  | "rate_limit"
  | "network"
  | "unknown";

export type IgLookup =
  | { ok: true; profile: IgProfile }
  | { ok: false; reason: IgFailure; error: string };

/** Caminhos do proprio Instagram que nunca sao perfil de empresa. */
const RESERVADOS = new Set([
  "p",
  "reel",
  "reels",
  "tv",
  "stories",
  "explore",
  "accounts",
  "direct",
  "about",
  "developer",
  "legal",
  "privacy",
  "terms",
]);

/** Extrai o @handle de uma URL de perfil salva no lead. */
export function igHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v = raw.trim();
  if (!v) return null;
  v = v.replace(/^@/, "");
  if (/^https?:\/\//i.test(v)) {
    try {
      v = new URL(v).pathname;
    } catch {
      return null;
    }
  }
  v = v.replace(/^\/+|\/+$/g, "").split("/")[0].split("?")[0];
  if (!/^[A-Za-z0-9._]{1,30}$/.test(v)) return null;
  const handle = v.toLowerCase();
  if (RESERVADOS.has(handle)) return null;
  return handle;
}

interface GraphResponse {
  business_discovery?: {
    username?: string;
    name?: string;
    biography?: string;
    website?: string;
    followers_count?: number;
    media_count?: number;
  };
  error?: { message?: string; code?: number; type?: string };
}

/**
 * Instagram Business Discovery: dados publicos de OUTRA conta Business/Creator.
 * Exige saber o @handle — a API nao permite descoberta por cidade ou categoria.
 */
export async function lookupIgProfile(opts: {
  accessToken: string;
  igUserId: string;
  handle: string;
}): Promise<IgLookup> {
  const fields =
    `business_discovery.username(${opts.handle})` +
    "{username,name,biography,website,followers_count,media_count}";
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${opts.igUserId}` +
    `?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(opts.accessToken)}`;

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  } catch {
    return { ok: false, reason: "network", error: "Sem conexão com o servidor da Meta." };
  }

  const data = (await res.json().catch(() => ({}))) as GraphResponse;

  if (data.error) {
    const msg = data.error.message ?? `HTTP ${res.status}`;
    const code = data.error.code;
    // 190 = token invalido/expirado; 10 e 200 = permissao ausente
    if (code === 190 || code === 10 || code === 200)
      return { ok: false, reason: "auth", error: msg };
    if (code === 4 || code === 17 || code === 32 || code === 613)
      return { ok: false, reason: "rate_limit", error: msg };
    // 110/100 costumam significar handle inexistente ou conta pessoal
    if (code === 110 || code === 100)
      return {
        ok: false,
        reason: "not_business",
        error: "Perfil não encontrado ou não é conta Business/Creator.",
      };
    return { ok: false, reason: "unknown", error: msg };
  }

  const bd = data.business_discovery;
  if (!bd?.username)
    return {
      ok: false,
      reason: "not_business",
      error: "Perfil não encontrado ou não é conta Business/Creator.",
    };

  return {
    ok: true,
    profile: {
      username: bd.username,
      name: bd.name ?? null,
      biography: bd.biography ?? null,
      website: bd.website ?? null,
      followersCount: typeof bd.followers_count === "number" ? bd.followers_count : null,
      mediaCount: typeof bd.media_count === "number" ? bd.media_count : null,
    },
  };
}
