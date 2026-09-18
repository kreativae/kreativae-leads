import { generateObject } from "ai";
import { z } from "zod";

const AD_MODEL = "anthropic/claude-sonnet-5";

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
  const { object } = await generateObject({
    model: AD_MODEL,
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
