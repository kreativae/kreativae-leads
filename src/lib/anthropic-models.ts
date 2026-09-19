/**
 * Modelos com visão oferecidos em Configurações pra aba IA — sempre um id
 * direto da API da Anthropic (sem prefixo de gateway). Módulo próprio, sem
 * nenhum import server-only, porque a tela de Configurações (client
 * component) também usa esta lista pro seletor.
 *
 * Preços em USD por milhão de tokens, conferidos em claude.com/pricing ao
 * escrever este arquivo — a Anthropic reajusta sem aviso prévio aqui
 * dentro, então valem como referência, não como fatura. "Opus 5 fast" não
 * tem tabela própria: a documentação só diz "2x o preço padrão do Opus 5"
 * para esse modo, então é o que replicamos aqui.
 */
export const ANTHROPIC_MODELS = [
  {
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    hint: "Recomendado — bom equilíbrio entre qualidade e custo.",
    priceInput: 2,
    priceOutput: 10,
    priceCacheRead: 0.2,
    priceCacheWrite: 2.5,
  },
  {
    id: "claude-opus-5",
    label: "Claude Opus 5",
    hint: "Mais poderoso, mais caro e mais lento.",
    priceInput: 5,
    priceOutput: 25,
    priceCacheRead: 0.5,
    priceCacheWrite: 6.25,
  },
  {
    id: "claude-opus-5-fast",
    label: "Claude Opus 5 (fast)",
    hint: "Opus com resposta mais rápida.",
    priceInput: 10,
    priceOutput: 50,
    priceCacheRead: 1,
    priceCacheWrite: 12.5,
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    hint: "Mais rápido e mais barato, qualidade menor.",
    priceInput: 1,
    priceOutput: 5,
    priceCacheRead: 0.1,
    priceCacheWrite: 1.25,
  },
] as const;
