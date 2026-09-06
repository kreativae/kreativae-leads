"use client";

import type { MessageStyle, Situacao, Slot } from "./messages";

/**
 * Frases favoritas de um item especifico (item 1, 3, 5...), separado dos
 * favoritos de mensagem inteira. Guarda o INDICE na lista do gerador, nunca
 * o texto: saudacao e gancho tem nome interpolado, e o indice e o unico
 * jeito de "a mesma frase" sobreviver de um lead para outro.
 *
 * style fica null quando o item nao varia por estilo (saudacao). situacao
 * fica null quando o item nao varia por ter ou nao site (saudacao,
 * apresentacao). Um favorito com situacao preenchida so faz sentido — e so
 * e oferecido — num lead na mesma situacao em que foi criado.
 */

const CHAVE = "kl:mensagem:favoritos-partes";
const MAXIMO_POR_SLOT = 8;

export interface FavoritoParte {
  id: string;
  slot: Slot;
  style: MessageStyle | null;
  situacao: Situacao | null;
  indice: number;
  criadoEm: string;
}

function lerTudo(): FavoritoParte[] {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return [];
    const lista = JSON.parse(bruto) as unknown;
    return Array.isArray(lista) ? (lista as FavoritoParte[]) : [];
  } catch {
    return [];
  }
}

function gravarTudo(lista: FavoritoParte[]): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(lista));
  } catch {
    // Cota cheia ou storage bloqueado: vale so para a sessao atual.
  }
}

export function listarFavoritosPartes(): FavoritoParte[] {
  return lerTudo();
}

function mesmaChave(
  f: FavoritoParte,
  slot: Slot,
  style: MessageStyle | null,
  situacao: Situacao | null,
  indice: number,
): boolean {
  return (
    f.slot === slot && f.style === style && f.situacao === situacao && f.indice === indice
  );
}

export function ehFavoritoParte(
  favoritos: FavoritoParte[],
  slot: Slot,
  style: MessageStyle | null,
  situacao: Situacao | null,
  indice: number,
): boolean {
  return favoritos.some((f) => mesmaChave(f, slot, style, situacao, indice));
}

/**
 * Liga/desliga o favorito desta frase. O teto e POR SLOT, nao global: um
 * item muito favoritado nao deveria expulsar os favoritos dos outros.
 */
export function alternarFavoritoParte(
  slot: Slot,
  style: MessageStyle | null,
  situacao: Situacao | null,
  indice: number,
): FavoritoParte[] {
  const atual = lerTudo();
  const existe = atual.find((f) => mesmaChave(f, slot, style, situacao, indice));
  let nova: FavoritoParte[];
  if (existe) {
    nova = atual.filter((f) => f.id !== existe.id);
  } else {
    const doSlot = atual.filter((f) => f.slot === slot);
    const resto = atual.filter((f) => f.slot !== slot);
    const novoDoSlot = [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        slot,
        style,
        situacao,
        indice,
        criadoEm: new Date().toISOString(),
      },
      ...doSlot,
    ].slice(0, MAXIMO_POR_SLOT);
    nova = [...novoDoSlot, ...resto];
  }
  gravarTudo(nova);
  return nova;
}

export function removerFavoritoParte(id: string): FavoritoParte[] {
  const nova = lerTudo().filter((f) => f.id !== id);
  gravarTudo(nova);
  return nova;
}
