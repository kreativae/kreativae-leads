"use client";

/**
 * Preferencias fixadas da Abordagem pronta: Assinatura, Diferenciais e o
 * modo Em partes / Bloco unico. Ficam no localStorage porque sao gosto de
 * quem esta usando o navegador, nao dado do lead — nao tem por que existir
 * no banco nem valeria a viagem ao servidor so para lembrar um toggle.
 */

const CHAVE = "kl:mensagem:prefs";

export type CampoFixavel = "assinatura" | "diferenciais" | "modoBloco";

interface Pref {
  fixado: boolean;
  valor: boolean;
}

type Prefs = Partial<Record<CampoFixavel, Pref>>;

function lerTudo(): Prefs {
  try {
    const bruto = localStorage.getItem(CHAVE);
    return bruto ? (JSON.parse(bruto) as Prefs) : {};
  } catch {
    // Storage bloqueado (aba anonima estrita, cota cheia): segue sem fixar.
    return {};
  }
}

export function lerPref(campo: CampoFixavel): Pref | undefined {
  return lerTudo()[campo];
}

export function gravarPref(campo: CampoFixavel, fixado: boolean, valor: boolean): void {
  try {
    const tudo = lerTudo();
    tudo[campo] = { fixado, valor };
    localStorage.setItem(CHAVE, JSON.stringify(tudo));
  } catch {
    // Nada a fazer: a sessao atual continua funcionando sem persistir.
  }
}
