/**
 * Modelos com visão oferecidos em Configurações pra aba IA — sempre um id
 * direto da API da Anthropic (sem prefixo de gateway). Módulo próprio, sem
 * nenhum import server-only, porque a tela de Configurações (client
 * component) também usa esta lista pro seletor.
 */
export const ANTHROPIC_MODELS = [
  { id: "claude-sonnet-5", label: "Claude Sonnet 5", hint: "Recomendado — bom equilíbrio entre qualidade e custo." },
  { id: "claude-opus-5", label: "Claude Opus 5", hint: "Mais poderoso, mais caro e mais lento." },
  { id: "claude-opus-5-fast", label: "Claude Opus 5 (fast)", hint: "Opus com resposta mais rápida." },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", hint: "Mais rápido e mais barato, qualidade menor." },
] as const;
