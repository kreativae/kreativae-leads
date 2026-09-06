"use client";

import type { MessageStyle } from "./messages";

/**
 * Mensagens favoritas da Abordagem pronta. Guarda a RECEITA (estilo +
 * variante), nunca o texto pronto: o texto tem o nome da empresa embutido e
 * nao serviria para outro lead. Aplicar um favorito refaz a mesma receita
 * com os dados do lead atual, entao ela funciona em qualquer lead, em
 * qualquer idioma, e se adapta sozinha a ter ou nao site — cada situacao usa
 * o gancho, CTA e fecho proprios dela.
 */

const CHAVE = "kl:mensagem:favoritos";
const MAXIMO = 12;

export interface Favorito {
  id: string;
  style: MessageStyle;
  variant: number;
  /** So para contexto na lista ("favoritado num lead sem site"); nao afeta a aplicacao. */
  situacaoOrigem: "comSite" | "semSite";
  criadoEm: string;
}

function lerTudo(): Favorito[] {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return [];
    const lista = JSON.parse(bruto) as unknown;
    return Array.isArray(lista) ? (lista as Favorito[]) : [];
  } catch {
    // Storage bloqueado ou corrompido: segue sem favoritos.
    return [];
  }
}

function gravarTudo(lista: Favorito[]): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(lista));
  } catch {
    // Cota cheia ou storage bloqueado: a lista em memoria continua valendo
    // para a sessao atual, so nao sobrevive a um F5.
  }
}

export function listarFavoritos(): Favorito[] {
  return lerTudo();
}

export function ehFavorito(
  favoritos: Favorito[],
  style: MessageStyle,
  variant: number,
): boolean {
  return favoritos.some((f) => f.style === style && f.variant === variant);
}

/**
 * Liga/desliga o favorito da combinacao atual. Mais recente primeiro, e um
 * teto de 12: e um atalho para as preferidas, nao um arquivo de tudo que já
 * foi bom.
 */
export function alternarFavorito(
  style: MessageStyle,
  variant: number,
  situacaoOrigem: "comSite" | "semSite",
): Favorito[] {
  const atual = lerTudo();
  const existe = atual.find((f) => f.style === style && f.variant === variant);
  const nova = existe
    ? atual.filter((f) => f.id !== existe.id)
    : [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          style,
          variant,
          situacaoOrigem,
          criadoEm: new Date().toISOString(),
        },
        ...atual,
      ].slice(0, MAXIMO);
  gravarTudo(nova);
  return nova;
}

export function removerFavorito(id: string): Favorito[] {
  const nova = lerTudo().filter((f) => f.id !== id);
  gravarTudo(nova);
  return nova;
}
