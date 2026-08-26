import type { SiteCheck } from "./site-analyzer";

export type MessageStyle = "direto" | "consultivo" | "proximo";

export const MESSAGE_STYLES: { key: MessageStyle; label: string }[] = [
  { key: "consultivo", label: "Consultivo" },
  { key: "direto", label: "Direto" },
  { key: "proximo", label: "Próximo" },
];

export interface MessageLead {
  id: string;
  companyName: string;
  ownerName: string | null;
  city: string | null;
  country: string;
  website: string | null;
  websiteGrade: string | null;
  websiteChecks?: SiteCheck[] | null;
}

export interface MessageOptions {
  style?: MessageStyle;
  variant?: number;
  useAnalysis?: boolean;
}

type Locale = "BR" | "PT";

/** Hash estavel: a mesma combinacao lead+variante gera sempre o mesmo texto. */
function seed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pick<T>(arr: T[], n: number): T {
  return arr[n % arr.length];
}

/* ---------------------------------------------------------------- saudacao */

const SAUDACOES: Record<Locale, ((nome?: string) => string)[]> = {
  BR: [
    (n) => (n ? `Olá, ${n}! Tudo bem?` : "Olá! Tudo bem?"),
    (n) => (n ? `Oi, ${n}, tudo certo?` : "Oi! Tudo certo?"),
    (n) => (n ? `Olá, ${n}. Espero que esteja tudo bem.` : "Olá! Espero que esteja tudo bem."),
  ],
  PT: [
    (n) => (n ? `Olá, ${n}! Tudo bem?` : "Olá! Tudo bem?"),
    (n) => (n ? `Bom dia, ${n}. Espero que esteja tudo bem.` : "Bom dia! Espero que esteja tudo bem."),
    (n) => (n ? `Olá, ${n}, como está?` : "Olá! Como está?"),
  ],
};

/* ------------------------------------------------------------ apresentacao */

const APRESENTACOES: Record<Locale, Record<MessageStyle, string[]>> = {
  BR: {
    consultivo: [
      "Aqui é da kreativ.ae, estúdio especializado em criação de sites profissionais.",
      "Meu nome é da kreativ.ae — trabalhamos com presença digital para empresas como a sua.",
    ],
    direto: [
      "Sou da kreativ.ae, criamos sites profissionais.",
      "Aqui é da kreativ.ae — estúdio de criação de sites.",
    ],
    proximo: [
      "Sou da kreativ.ae, um estúdio que cria sites para empresas daqui da região.",
      "Aqui é da kreativ.ae — a gente cria sites profissionais para empresas como a sua.",
    ],
  },
  PT: {
    consultivo: [
      "Falo da kreativ.ae, estúdio especializado na criação de sites profissionais.",
      "Contacto-o da parte da kreativ.ae — trabalhamos presença digital para empresas como a vossa.",
    ],
    direto: [
      "Sou da kreativ.ae, criamos sites profissionais.",
      "Falo da kreativ.ae — estúdio de criação de sites.",
    ],
    proximo: [
      "Sou da kreativ.ae, um estúdio que cria sites para empresas como a vossa.",
      "Falo da kreativ.ae — ajudamos empresas a ter uma presença online à altura do trabalho que fazem.",
    ],
  },
};

/* ----------------------------------------------------------------- ganchos */

function ganchoSemSite(l: Locale, style: MessageStyle, empresa: string, lugar: string, n: number): string {
  const BR = {
    consultivo: [
      `Estive pesquisando ${empresa}${lugar} e reparei que ainda não têm um site próprio. Hoje a maioria dos clientes pesquisa no Google antes de contratar — quem não aparece acaba perdendo a venda para o concorrente que aparece.`,
      `Encontrei ${empresa}${lugar} e notei que a empresa ainda não tem site. Isso significa que toda vez que alguém procura pelo serviço no Google, quem aparece é outro.`,
    ],
    direto: [
      `Vi que ${empresa} ainda não tem site. Quem procura o serviço no Google hoje encontra os concorrentes, não vocês.`,
      `Reparei que ${empresa}${lugar} não tem site próprio — e é aí que a maioria dos clientes procura antes de decidir.`,
    ],
    proximo: [
      `Estava pesquisando empresas${lugar} e dei de cara com ${empresa}. Achei o trabalho de vocês bom, mas vi que ainda não têm um site — e isso está deixando cliente na mesa.`,
      `Conheci ${empresa}${lugar} e fiquei com uma pulga atrás da orelha: vocês não têm site. Quem pesquisa no Google hoje acaba indo parar no concorrente.`,
    ],
  };
  const PT = {
    consultivo: [
      `Estive a pesquisar ${empresa}${lugar} e reparei que ainda não têm site próprio. Hoje a maioria dos clientes pesquisa no Google antes de contratar — quem não aparece acaba por perder o contacto para a concorrência.`,
      `Encontrei ${empresa}${lugar} e notei que ainda não têm site. Sempre que alguém procura o serviço online, quem aparece é outra empresa.`,
    ],
    direto: [
      `Vi que ${empresa} ainda não tem site. Quem procura o serviço no Google encontra a concorrência, não a vossa empresa.`,
      `Reparei que ${empresa}${lugar} não tem site próprio — e é aí que a maioria dos clientes procura antes de decidir.`,
    ],
    proximo: [
      `Estava a pesquisar empresas${lugar} e encontrei ${empresa}. Gostei do vosso trabalho, mas reparei que ainda não têm site — e isso anda a custar contactos.`,
      `Conheci ${empresa}${lugar} e ficou-me uma dúvida: não têm site. Quem pesquisa no Google acaba por ir ter à concorrência.`,
    ],
  };
  return pick((l === "PT" ? PT : BR)[style], n);
}

function ganchoSiteFraco(l: Locale, style: MessageStyle, empresa: string, n: number): string {
  const BR = {
    consultivo: [
      `Visitei o site da ${empresa} e notei que ele está bem defasado em relação ao que o Google prioriza hoje. Isso costuma custar contatos todos os dias, sem que a empresa perceba.`,
      `Dei uma olhada no site da ${empresa} e vi alguns pontos que provavelmente estão afastando clientes antes mesmo do primeiro contato.`,
    ],
    direto: [
      `Olhei o site da ${empresa} e ele está desatualizado. Isso derruba o ranqueamento no Google e a confiança de quem chega.`,
      `O site da ${empresa} está fora dos padrões atuais — e isso aparece para o cliente logo nos primeiros segundos.`,
    ],
    proximo: [
      `Entrei no site da ${empresa} e senti que ele não faz jus ao trabalho de vocês. Dá para melhorar bastante com pouca coisa.`,
      `Fui ver o site da ${empresa} e achei que ele está devendo um pouco perto da qualidade do serviço.`,
    ],
  };
  const PT = {
    consultivo: [
      `Visitei o site da ${empresa} e notei que está bastante desatualizado face ao que o Google privilegia hoje. Isso costuma custar contactos todos os dias, sem a empresa dar por isso.`,
      `Dei uma vista de olhos no site da ${empresa} e encontrei alguns pontos que estarão a afastar clientes antes mesmo do primeiro contacto.`,
    ],
    direto: [
      `Vi o site da ${empresa} e está desatualizado. Isso prejudica o posicionamento no Google e a confiança de quem lá chega.`,
      `O site da ${empresa} está fora dos padrões atuais — e isso nota-se nos primeiros segundos.`,
    ],
    proximo: [
      `Entrei no site da ${empresa} e senti que não faz justiça ao vosso trabalho. Dá para melhorar bastante sem grande complicação.`,
      `Fui ver o site da ${empresa} e achei que está a ficar aquém da qualidade do serviço.`,
    ],
  };
  return pick((l === "PT" ? PT : BR)[style], n);
}

/* -------------------------------------------- gancho a partir do diagnostico */

/** Traduz os ids do analisador para linguagem de cliente, por locale. */
const ACHADOS: Record<string, Record<Locale, string>> = {
  https: {
    BR: "o site não tem certificado de segurança, então o navegador avisa o visitante que ele é “não seguro”",
    PT: "o site não tem certificado de segurança, pelo que o navegador avisa o visitante de que é “não seguro”",
  },
  responsive: {
    BR: "ele não está adaptado para celular, de onde vem mais de 60% das visitas hoje",
    PT: "não está adaptado a telemóveis, de onde vem mais de 60% das visitas hoje",
  },
  flash: {
    BR: "ele usa uma tecnologia descontinuada que não abre mais em navegador nenhum",
    PT: "usa tecnologia descontinuada que já não abre em navegador nenhum",
  },
  freshness: {
    BR: "o conteúdo não é atualizado há anos, o que passa a impressão de empresa parada",
    PT: "o conteúdo não é atualizado há anos, o que passa a ideia de empresa parada",
  },
  tables: {
    BR: "a estrutura da página segue um padrão dos anos 2000",
    PT: "a estrutura da página segue um padrão dos anos 2000",
  },
  description: {
    BR: "faltam as informações que o Google usa para descrever o site nos resultados",
    PT: "faltam as informações que o Google usa para descrever o site nos resultados",
  },
  title: {
    BR: "o título da página não está otimizado, o que atrapalha o ranqueamento",
    PT: "o título da página não está otimizado, o que prejudica o posicionamento",
  },
  social: {
    BR: "quando alguém compartilha o link no WhatsApp, ele aparece sem imagem",
    PT: "quando alguém partilha a ligação no WhatsApp, aparece sem imagem",
  },
  reachable: {
    BR: "o site simplesmente não está no ar — pode ser hospedagem vencida ou domínio expirado",
    PT: "o site não está no ar — pode ser alojamento vencido ou domínio expirado",
  },
};

/** Escolhe os achados mais graves e monta um gancho concreto. */
function ganchoDiagnostico(
  l: Locale,
  style: MessageStyle,
  empresa: string,
  checks: SiteCheck[],
  n: number,
): string | null {
  const ordem = ["reachable", "flash", "https", "responsive", "freshness", "tables", "social", "description", "title"];
  const achados = ordem
    .filter((id) => checks.some((c) => c.id === id && (c.status === "fail" || c.status === "warn")))
    .filter((id) => ACHADOS[id])
    .slice(0, 2)
    .map((id) => ACHADOS[id][l]);

  if (achados.length === 0) return null;

  const lista =
    achados.length === 1 ? achados[0] : `${achados[0]}; e ${achados[1]}`;

  const aberturas =
    l === "PT"
      ? {
          consultivo: [`Fiz uma análise técnica do site da ${empresa} e encontrei dois pontos concretos:`, `Analisei o site da ${empresa} e há dois problemas que saltam à vista:`],
          direto: [`Analisei o site da ${empresa}. Dois problemas:`, `Passei o site da ${empresa} por uma análise técnica. O que encontrei:`],
          proximo: [`Fui espreitar o site da ${empresa} com atenção e reparei em duas coisas:`, `Dei uma vista de olhos técnica no site da ${empresa} e notei o seguinte:`],
        }
      : {
          consultivo: [`Fiz uma análise técnica do site da ${empresa} e encontrei dois pontos concretos:`, `Analisei o site da ${empresa} e há dois problemas que saltam aos olhos:`],
          direto: [`Analisei o site da ${empresa}. Dois problemas:`, `Passei o site da ${empresa} por uma análise técnica. O que achei:`],
          proximo: [`Fui olhar o site da ${empresa} com calma e reparei em duas coisas:`, `Dei uma olhada técnica no site da ${empresa} e notei o seguinte:`],
        };

  return `${pick(aberturas[style], n)} ${lista}.`;
}

/* --------------------------------------------------------------------- cta */

const CTAS: Record<Locale, Record<MessageStyle, string[]>> = {
  BR: {
    consultivo: [
      "Posso te mostrar em 2 minutos, sem compromisso, como isso mudaria a captação de clientes de vocês? Preparo um diagnóstico gratuito.",
      "Se fizer sentido, preparo um diagnóstico gratuito e te mostro o que daria para melhorar. Leva uns 2 minutos.",
    ],
    direto: [
      "Faz sentido eu te mandar um diagnóstico gratuito com o que dá para resolver?",
      "Quer que eu prepare uma proposta rápida? Sem compromisso.",
    ],
    proximo: [
      "Se quiser, preparo um diagnóstico gratuito e a gente conversa sem compromisso nenhum.",
      "Posso te mandar um diagnóstico rápido, sem custo. O que acha?",
    ],
  },
  PT: {
    consultivo: [
      "Posso mostrar-lhe em 2 minutos, sem compromisso, como isto mudaria a captação de clientes? Preparo um diagnóstico gratuito.",
      "Se fizer sentido, preparo um diagnóstico gratuito e mostro-lhe o que daria para melhorar. Demora 2 minutos.",
    ],
    direto: [
      "Faz sentido enviar-lhe um diagnóstico gratuito com o que dá para resolver?",
      "Quer que prepare uma proposta rápida? Sem compromisso.",
    ],
    proximo: [
      "Se quiser, preparo um diagnóstico gratuito e conversamos sem compromisso nenhum.",
      "Posso enviar-lhe um diagnóstico rápido, sem custo. O que acha?",
    ],
  },
};

const FECHOS: Record<Locale, string[]> = {
  BR: ["Fica o convite. Obrigado!", "Qualquer coisa, é só chamar. Obrigado!", "Fico à disposição. Obrigado!"],
  PT: ["Fica o convite. Obrigado!", "Fico ao dispor. Obrigado!", "Qualquer questão, diga. Obrigado!"],
};

/* ------------------------------------------------------------------ montagem */

export function buildWhatsappMessage(
  lead: MessageLead,
  opts: MessageOptions = {},
): string {
  const l: Locale = lead.country === "PT" ? "PT" : "BR";
  const variant = opts.variant ?? 0;
  const base = seed(`${lead.id}:${variant}`);
  const style = opts.style ?? pick(MESSAGE_STYLES, base).key;

  const primeiroNome = lead.ownerName?.trim().split(/\s+/)[0];
  const empresa = lead.companyName;
  const lugar = lead.city ? ` em ${lead.city}` : "";

  const saudacao = pick(SAUDACOES[l], base)(primeiroNome);
  const apresentacao = pick(APRESENTACOES[l][style], base >> 3);

  let gancho: string | null = null;
  if (opts.useAnalysis && lead.websiteChecks?.length) {
    gancho = ganchoDiagnostico(l, style, empresa, lead.websiteChecks, base >> 5);
  }
  if (!gancho) {
    gancho = !lead.website
      ? ganchoSemSite(l, style, empresa, lugar, base >> 5)
      : ganchoSiteFraco(l, style, empresa, base >> 5);
  }

  const cta = pick(CTAS[l][style], base >> 7);
  const fecho = pick(FECHOS[l], base >> 9);

  return `${saudacao}\n\n${apresentacao}\n\n${gancho}\n\n${cta}\n\n${fecho}`;
}

export function waMeLink(
  whatsappDigits: string | null,
  message: string,
): string | null {
  if (!whatsappDigits) return null;
  return `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(message)}`;
}
