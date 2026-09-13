/**
 * RP ID e origem tem que bater exatamente com o que o navegador ve — sem
 * porta no rpID, com porta na origem. Derivado da própria requisição pra
 * funcionar em localhost e produção sem configuração extra.
 */
export function rpFromRequest(req: Request): { rpID: string; origin: string } {
  const originHeader = req.headers.get("origin");
  if (originHeader) {
    return { rpID: new URL(originHeader).hostname, origin: originHeader };
  }
  const url = new URL(req.url);
  return { rpID: url.hostname, origin: url.origin };
}

export const RP_NAME = "Kreativ.ae — Radar de Leads";
