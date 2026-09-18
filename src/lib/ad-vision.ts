import { generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { getAnthropicModel, getEffectiveSetting } from "@/lib/settings-db";

const AdExtractionSchema = z.object({
  companyName: z
    .string()
    .describe("Nome da empresa ou marca anunciante. Se não houver nome claro, use a melhor descrição curta do negócio."),
  ownerName: z
    .string()
    .nullable()
    .describe("Nome de uma pessoa específica citada como responsável pelo negócio, se houver."),
  segment: z
    .string()
    .nullable()
    .describe("Segmento/categoria do negócio (ex.: Estética, Advocacia, Restaurante, Arquitetura)."),
  instagramHandle: z
    .string()
    .nullable()
    .describe("@ do Instagram citado no anúncio, sem o @. Null se não aparecer nenhum."),
  website: z
    .string()
    .nullable()
    .describe("Site (domínio ou URL) citado no anúncio, se houver."),
  phone: z
    .string()
    .nullable()
    .describe("Telefone ou WhatsApp citado no anúncio, no formato em que aparece."),
  email: z.string().nullable().describe("E-mail citado no anúncio, se houver."),
  country: z
    .enum(["BR", "PT"])
    .describe("País mais provável do anunciante, pelo idioma, moeda ou formato do telefone. BR como padrão em caso de dúvida."),
  adSummary: z
    .string()
    .describe("Resumo em 1-2 frases do que o anúncio oferece ou promete."),
  confidence: z
    .enum(["alta", "media", "baixa"])
    .describe("Confiança geral de que os dados extraídos identificam corretamente o anunciante."),
});

export type AdExtraction = z.infer<typeof AdExtractionSchema>;

const PROMPT = `A imagem é um print de um anúncio (ou post patrocinado) visto no Instagram ou em outra rede social.
Extraia os dados do NEGÓCIO ANUNCIANTE — não do usuário que viu o anúncio.
Use apenas o que está visível na imagem (texto do anúncio, @ mencionado, telefone, site, etc). Não invente dados que não aparecem.
Se um campo não estiver visível ou não puder ser inferido com razoável segurança, retorne null.`;

/** Extrai dados do anunciante a partir do print de um anúncio, via visão do Claude. */
export async function extractAdInfo(imageUrl: string): Promise<AdExtraction> {
  const apiKey = await getEffectiveSetting("anthropic_api_key", "ANTHROPIC_API_KEY");
  if (!apiKey)
    throw new Error(
      "IA não configurada — adicione a Anthropic API Key em Configurações.",
    );
  const anthropic = createAnthropic({ apiKey });
  const modelId = await getAnthropicModel();

  const { object } = await generateObject({
    model: anthropic(modelId),
    schema: AdExtractionSchema,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          { type: "file", mediaType: "image", data: new URL(imageUrl) },
        ],
      },
    ],
  });
  return object;
}

/** Testa a chave contra a API real (lista de modelos — não gasta tokens), sem rodar o pipeline inteiro. */
export async function testAnthropicKey(
  apiKey: string,
): Promise<{ ok: true; detail: string } | { ok: false; error: string }> {
  const res = await fetch("https://api.anthropic.com/v1/models?limit=1", {
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  }).catch(() => null);
  if (!res) return { ok: false, error: "Sem conexão com a API da Anthropic." };
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok)
    return { ok: false, error: data.error?.message ?? `Anthropic respondeu HTTP ${res.status}.` };
  return { ok: true, detail: "Chave autenticou normalmente." };
}
