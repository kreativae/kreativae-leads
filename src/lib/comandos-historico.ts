import { createHash } from "node:crypto";
import { and, asc, eq, like, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import type { CandidatoComando } from "@/lib/dork-extract";
import type { DorkInput } from "@/lib/dork";

/**
 * Histórico das buscas rodadas na aba Comandos, com os resultados de cada
 * página. Serve pra duas coisas: ver o que a equipe já pesquisou e NÃO
 * pagar de novo ao Serper por uma página que já foi buscada.
 *
 * Cada busca é uma linha própria na tabela de settings, com chave
 * "comandos_busca:<hash do comando>" — assim não precisa de tabela nova
 * (nem de migração aplicada à mão em produção), e cada gravação mexe só
 * na sua linha, sem ler-modificar-gravar uma lista inteira.
 */

const PREFIXO = "comandos_busca:";
/** Buscas guardadas; ao passar disso as mais antigas (por uso) saem. */
const LIMITE_BUSCAS = 60;

export interface BuscaSalva {
  id: string;
  comando: string;
  input: DorkInput | null;
  cidade: string | null;
  categoria: string | null;
  criadoEm: string;
  atualizadoEm: string;
  /** Resultados por página já buscada no Serper ("1", "2"…). */
  paginas: Record<string, { buscadoEm: string; candidatos: CandidatoComando[] }>;
  temMais: boolean;
}

export interface ResumoBusca {
  id: string;
  comando: string;
  input: DorkInput | null;
  atualizadoEm: string;
  paginas: number;
  resultados: number;
  comContato: number;
}

/** Espaços repetidos não fazem outro comando — "a  b" e "a b" são a mesma busca. */
export function normalizarComando(comando: string): string {
  return comando.replace(/\s+/g, " ").trim();
}

export function idDoComando(comando: string): string {
  return createHash("sha1").update(normalizarComando(comando)).digest("hex").slice(0, 20);
}

function parse(value: string | null): BuscaSalva | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as BuscaSalva;
  } catch {
    return null;
  }
}

export async function lerBusca(id: string): Promise<BuscaSalva | null> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, PREFIXO + id))
    .limit(1);
  return parse(row?.value ?? null);
}

/** Grava uma página recém-buscada no Serper dentro da busca do comando (criando a busca se for a 1ª vez). */
export async function salvarPagina(opts: {
  comando: string;
  input: DorkInput | null;
  cidade: string | null;
  categoria: string | null;
  pagina: number;
  candidatos: CandidatoComando[];
  temMais: boolean;
}): Promise<void> {
  const comando = normalizarComando(opts.comando);
  const id = idDoComando(comando);
  const agora = new Date().toISOString();
  const atual = await lerBusca(id);
  const busca: BuscaSalva = {
    id,
    comando,
    input: opts.input ?? atual?.input ?? null,
    cidade: opts.cidade,
    categoria: opts.categoria,
    criadoEm: atual?.criadoEm ?? agora,
    atualizadoEm: agora,
    // Uma página nova da 1 invalida as seguintes: o Google pode ter mudado
    // a ordem, e misturar páginas de dias diferentes repete/pula resultados.
    paginas: {
      ...(opts.pagina === 1 ? {} : (atual?.paginas ?? {})),
      // existingLeadId é recalculado toda vez que a busca é lida — não guarda.
      [String(opts.pagina)]: {
        buscadoEm: agora,
        candidatos: opts.candidatos.map((c) => ({ ...c, existingLeadId: null })),
      },
    },
    temMais: opts.temMais,
  };
  const value = JSON.stringify(busca);
  await db
    .insert(settings)
    .values({ key: PREFIXO + id, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  await podar();
}

/** Marca a busca como usada agora (reaberta do histórico) — ela sobe pro topo da lista. */
export async function tocarBusca(id: string): Promise<void> {
  await db
    .update(settings)
    .set({ updatedAt: new Date() })
    .where(eq(settings.key, PREFIXO + id));
}

async function podar(): Promise<void> {
  const manter = await db
    .select({ key: settings.key })
    .from(settings)
    .where(like(settings.key, `${PREFIXO}%`))
    .orderBy(sql`${settings.updatedAt} desc`)
    .limit(LIMITE_BUSCAS);
  if (manter.length < LIMITE_BUSCAS) return;
  await db.delete(settings).where(
    and(
      like(settings.key, `${PREFIXO}%`),
      notInArray(
        settings.key,
        manter.map((m) => m.key),
      ),
    ),
  );
}

function temContato(c: CandidatoComando): boolean {
  return !!(c.email || c.phone || c.whatsapp);
}

export async function listarHistorico(): Promise<ResumoBusca[]> {
  const rows = await db
    .select({ value: settings.value, updatedAt: settings.updatedAt })
    .from(settings)
    .where(like(settings.key, `${PREFIXO}%`))
    .orderBy(sql`${settings.updatedAt} desc`, asc(settings.key));
  const out: ResumoBusca[] = [];
  for (const r of rows) {
    const b = parse(r.value);
    if (!b) continue;
    const todos = Object.values(b.paginas).flatMap((p) => p.candidatos);
    out.push({
      id: b.id,
      comando: b.comando,
      input: b.input,
      atualizadoEm: r.updatedAt.toISOString(),
      paginas: Object.keys(b.paginas).length,
      resultados: todos.length,
      comContato: todos.filter(temContato).length,
    });
  }
  return out;
}

export async function excluirBusca(id: string): Promise<void> {
  await db.delete(settings).where(eq(settings.key, PREFIXO + id));
}

export async function limparHistorico(): Promise<void> {
  await db.delete(settings).where(like(settings.key, `${PREFIXO}%`));
}
