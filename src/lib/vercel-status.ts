import { getEffectiveSetting } from "@/lib/settings-db";

// Nao sao segredo — so identificam ESTE projeto/time na Vercel, do jeito
// que .vercel/project.json ja guarda localmente. O token de API (esse sim
// sensivel) fica em Configurações → Logs & segredos, como os outros.
const PROJECT_ID = "prj_qUYXp7BuNCIwQR7hpZH6kX5ODlan";
const TEAM_ID = "team_3kgrH2DArST83AWN2s7y8PGz";

interface VercelDeploymentApi {
  uid: string;
  url: string;
  created: number;
  readyState: string;
  target: string | null;
  inspectorUrl: string | null;
  meta?: Record<string, string>;
}

export interface DeploymentResumo {
  uid: string;
  url: string;
  criadoEm: string;
  estado: string;
  ambiente: string | null;
  inspectorUrl: string | null;
  commitSha: string | null;
  commitMensagem: string | null;
  commitBranch: string | null;
}

export type StatusVercel =
  | { ok: true; deployments: DeploymentResumo[] }
  | { ok: false; error: string };

/** Ultimos deploys do projeto, direto da API da Vercel (needs Configurações → Logs & segredos → Vercel API Token). */
export async function lerStatusVercel(): Promise<StatusVercel> {
  const token = await getEffectiveSetting("vercel_api_token", "VERCEL_API_TOKEN");
  if (!token) return { ok: false, error: "Vercel API Token não configurado." };

  const sp = new URLSearchParams({
    projectId: PROJECT_ID,
    teamId: TEAM_ID,
    limit: "5",
  });
  let res: Response;
  try {
    res = await fetch(`https://api.vercel.com/v7/deployments?${sp.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Sem conexão com a API da Vercel." };
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return {
      ok: false,
      error: body.error?.message ?? `Vercel respondeu HTTP ${res.status}.`,
    };
  }

  const data = (await res.json()) as { deployments?: VercelDeploymentApi[] };
  const deployments = (data.deployments ?? []).map((d) => ({
    uid: d.uid,
    url: d.url,
    criadoEm: new Date(d.created).toISOString(),
    estado: d.readyState,
    ambiente: d.target,
    inspectorUrl: d.inspectorUrl,
    commitSha: d.meta?.githubCommitSha?.slice(0, 7) ?? null,
    commitMensagem: d.meta?.githubCommitMessage ?? null,
    commitBranch: d.meta?.githubCommitRef ?? null,
  }));

  return { ok: true, deployments };
}
