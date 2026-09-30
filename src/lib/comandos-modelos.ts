import { getSetting, setSetting } from "@/lib/settings-db";
import { CAMPOS_LISTA, DORK_VAZIO, type DorkInput } from "@/lib/dork";

/**
 * Modelos salvos da aba Comandos. Ficam num JSON na tabela de settings
 * (mesmo esquema do nav_order) em vez de tabela própria: são poucos, lidos
 * sempre inteiros, e assim não precisa de migração. Lê-modifica-grava sem
 * trava — duas pessoas salvando no mesmo segundo podem perder um modelo,
 * risco aceitável pra uma equipe pequena.
 */
export interface ComandoModelo {
  id: string;
  nome: string;
  input: DorkInput;
  usos: number;
  criadoEm: string;
  usadoEm: string | null;
}

const LIMITE_MODELOS = 100;
const LIMITE_TERMOS = 40;
const LIMITE_TAMANHO_TERMO = 120;

function listaDeTextos(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().slice(0, LIMITE_TAMANHO_TERMO))
    .filter(Boolean)
    .slice(0, LIMITE_TERMOS);
}

/** Aceita só os campos conhecidos, como listas de texto — o resto é descartado. */
export function sanitizarInput(v: unknown): DorkInput {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out: DorkInput = { ...DORK_VAZIO, pais: o.pais === "PT" ? "PT" : "BR" };
  for (const k of CAMPOS_LISTA) out[k] = listaDeTextos(o[k]);
  return out;
}

export async function listarModelos(): Promise<ComandoModelo[]> {
  const raw = await getSetting("comandos_modelos");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ComandoModelo[]) : [];
  } catch {
    return [];
  }
}

async function gravar(modelos: ComandoModelo[]): Promise<void> {
  await setSetting("comandos_modelos", modelos.length ? JSON.stringify(modelos) : null);
}

export async function criarModelo(nome: string, input: DorkInput): Promise<ComandoModelo> {
  const modelos = await listarModelos();
  const novo: ComandoModelo = {
    id: crypto.randomUUID(),
    nome: nome.trim().slice(0, 80),
    input,
    usos: 0,
    criadoEm: new Date().toISOString(),
    usadoEm: null,
  };
  await gravar([novo, ...modelos].slice(0, LIMITE_MODELOS));
  return novo;
}

export async function registrarUsoModelo(id: string): Promise<boolean> {
  const modelos = await listarModelos();
  const m = modelos.find((x) => x.id === id);
  if (!m) return false;
  m.usos += 1;
  m.usadoEm = new Date().toISOString();
  await gravar(modelos);
  return true;
}

export async function excluirModelo(id: string): Promise<boolean> {
  const modelos = await listarModelos();
  const restantes = modelos.filter((x) => x.id !== id);
  if (restantes.length === modelos.length) return false;
  await gravar(restantes);
  return true;
}
