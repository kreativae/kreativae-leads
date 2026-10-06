/**
 * Sufixos de segundo nível em que o domínio registrável tem três partes
 * (empresa.com.br, empresa.co.uk). Lista curta e pragmática, não a Public
 * Suffix List inteira: cobre os países com que este app trabalha e os
 * casos mais comuns.
 */
const SEGUNDO_NIVEL = new Set([
  "com", "net", "org", "gov", "edu", "co", "ac", "adv", "arq", "eng", "med", "ind", "art", "blog", "eco", "nom", "pro", "tur",
]);

/**
 * Reduz o que a pessoa digitou ao domínio que de fato se registra:
 * "https://www.kreativ.ae/contato" → "kreativ.ae",
 * "blog.empresa.com.br" → "empresa.com.br".
 *
 * Sem isso a consulta de registro olha "www.kreativ.ae", que nenhum
 * registro conhece (subdomínio não se registra) e volta "disponível".
 */
export function dominioRegistravel(bruto: string): string {
  let v = bruto.trim().toLowerCase();
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // https://
  v = v.split(/[/?#]/)[0]; // caminho, query, âncora
  v = v.replace(/^[^@]*@/, ""); // usuario@
  v = v.replace(/:\d+$/, ""); // :porta
  v = v.replace(/\.+$/, ""); // ponto final de FQDN
  const partes = v.split(".").filter(Boolean);
  if (partes.length <= 2) return partes.join(".");
  const tld = partes[partes.length - 1];
  const segundo = partes[partes.length - 2];
  const tamanho = tld.length === 2 && SEGUNDO_NIVEL.has(segundo) ? 3 : 2;
  return partes.slice(-tamanho).join(".");
}
