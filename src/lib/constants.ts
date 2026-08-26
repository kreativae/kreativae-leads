export type SegmentPreset = {
  key: string;
  label: string;
  tags: [string, string][];
};

export const SEGMENT_PRESETS: SegmentPreset[] = [
  { key: "advogados", label: "Advogados", tags: [["office", "lawyer"]] },
  { key: "arquitetos", label: "Arquitetos", tags: [["office", "architect"]] },
  {
    key: "dentistas",
    label: "Dentistas",
    tags: [
      ["amenity", "dentist"],
      ["healthcare", "dentist"],
    ],
  },
  {
    key: "medicos",
    label: "Médicos & Clínicas",
    tags: [
      ["amenity", "doctors"],
      ["amenity", "clinic"],
      ["healthcare", "doctor"],
      ["healthcare", "clinic"],
    ],
  },
  {
    key: "clinicas-estetica",
    label: "Clínicas de Estética",
    tags: [["shop", "beauty"]],
  },
  { key: "psicologos", label: "Psicólogos", tags: [["healthcare", "psychotherapist"]] },
  { key: "contadores", label: "Contadores", tags: [["office", "accountant"]] },
  {
    key: "imobiliarias",
    label: "Imobiliárias",
    tags: [["office", "estate_agent"]],
  },
  { key: "engenharia", label: "Engenharia", tags: [["office", "engineer"]] },
  { key: "seguros", label: "Corretoras de Seguros", tags: [["office", "insurance"]] },
  { key: "academias", label: "Academias", tags: [["leisure", "fitness_centre"]] },
  {
    key: "pet",
    label: "Pet Shops & Veterinários",
    tags: [
      ["shop", "pet"],
      ["amenity", "veterinary"],
    ],
  },
  { key: "restaurantes", label: "Restaurantes", tags: [["amenity", "restaurant"]] },
  { key: "saloes", label: "Salões de Beleza", tags: [["shop", "hairdresser"]] },
];

export type CityPreset = {
  label: string;
  query: string;
  country: "BR" | "PT";
};

export const CITY_PRESETS: CityPreset[] = [
  { label: "Londrina, PR", query: "Londrina, Paraná, Brasil", country: "BR" },
  { label: "São Paulo, SP", query: "São Paulo, SP, Brasil", country: "BR" },
  { label: "Curitiba, PR", query: "Curitiba, Paraná, Brasil", country: "BR" },
  { label: "Maringá, PR", query: "Maringá, Paraná, Brasil", country: "BR" },
  { label: "Campinas, SP", query: "Campinas, SP, Brasil", country: "BR" },
  { label: "Rio de Janeiro, RJ", query: "Rio de Janeiro, RJ, Brasil", country: "BR" },
  { label: "Belo Horizonte, MG", query: "Belo Horizonte, MG, Brasil", country: "BR" },
  { label: "Lisboa", query: "Lisboa, Portugal", country: "PT" },
  { label: "Porto", query: "Porto, Portugal", country: "PT" },
  { label: "Braga", query: "Braga, Portugal", country: "PT" },
  { label: "Coimbra", query: "Coimbra, Portugal", country: "PT" },
  { label: "Cascais", query: "Cascais, Portugal", country: "PT" },
  { label: "Sintra", query: "Sintra, Portugal", country: "PT" },
  { label: "Aveiro", query: "Aveiro, Portugal", country: "PT" },
  { label: "Faro", query: "Faro, Portugal", country: "PT" },
  { label: "Vila Nova de Gaia", query: "Vila Nova de Gaia, Portugal", country: "PT" },
];

export const LEAD_STATUSES = [
  { key: "new", label: "Novo" },
  { key: "contacted", label: "Contatado" },
  { key: "negotiating", label: "Negociando" },
  { key: "won", label: "Fechado" },
  { key: "lost", label: "Descartado" },
] as const;

export type LeadStatusKey = (typeof LEAD_STATUSES)[number]["key"];

/**
 * Formulacoes alternativas para o Google Places. O Text Search devolve no
 * maximo 60 resultados POR CONSULTA — a unica forma de passar disso e
 * perguntar de outro jeito e juntar, deduplicando pelo id do lugar.
 */
export const PLACES_TERMS: Record<string, string[]> = {
  advogados: ["escritório de advocacia", "sociedade de advogados", "advogado trabalhista", "advogado de família"],
  arquitetos: ["escritório de arquitetura", "arquitetura e urbanismo", "arquiteto de interiores", "projeto arquitetônico"],
  dentistas: ["clínica odontológica", "consultório odontológico", "ortodontia", "implante dentário"],
  medicos: ["clínica médica", "consultório médico", "centro médico"],
  "clinicas-estetica": ["clínica de estética", "harmonização facial", "estética avançada"],
  psicologos: ["consultório de psicologia", "psicoterapia", "clínica de psicologia"],
  contadores: ["escritório de contabilidade", "contabilidade empresarial", "contabilista"],
  imobiliarias: ["imobiliária", "mediação imobiliária", "corretor de imóveis"],
  engenharia: ["escritório de engenharia", "engenharia civil", "projetos estruturais"],
  seguros: ["corretora de seguros", "mediador de seguros", "seguros automóvel"],
  academias: ["academia de musculação", "studio de pilates", "ginásio"],
  pet: ["pet shop", "clínica veterinária", "banho e tosa"],
  restaurantes: ["restaurante", "marisqueira", "churrascaria"],
  saloes: ["salão de beleza", "cabeleireiro", "barbearia"],
};

/** Fallback para segmento digitado livremente, sem preset. */
const TERMOS_GENERICOS = ["escritório de", "empresa de", "clínica de"];

export function termsForSegment(key: string | null, label: string): string[] {
  if (key && PLACES_TERMS[key]) return PLACES_TERMS[key];
  return TERMOS_GENERICOS.map((t) => `${t} ${label.toLowerCase()}`);
}

/** Consulta da rodada N. Rodada 0 usa o proprio rotulo do segmento. */
export function queryForRound(
  key: string | null,
  label: string,
  round: number,
): string {
  if (round <= 0) return label;
  const termos = termsForSegment(key, label);
  return termos[(round - 1) % termos.length];
}

/** Quantas rodadas distintas existem para este segmento. */
export function roundsAvailable(key: string | null, label: string): number {
  return 1 + termsForSegment(key, label).length;
}

export function matchSegment(input: string): {
  key: string | null;
  displayLabel: string;
  tags: [string, string][] | null;
} {
  const q = input.trim().toLowerCase();
  const exact = SEGMENT_PRESETS.find(
    (s) => s.key === q || s.label.toLowerCase() === q,
  );
  if (exact) return { key: exact.key, displayLabel: exact.label, tags: exact.tags };
  const partial = SEGMENT_PRESETS.find(
    (s) => s.label.toLowerCase().includes(q) || q.includes(s.key),
  );
  if (partial && q.length >= 3)
    return { key: partial.key, displayLabel: partial.label, tags: partial.tags };
  return { key: null, displayLabel: input.trim(), tags: null };
}
