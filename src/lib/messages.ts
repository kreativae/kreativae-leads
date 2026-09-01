import type { SiteCheck } from "./site-analyzer";

export type MessageStyle =
  | "direto"
  | "consultivo"
  | "proximo"
  | "curto"
  | "pergunta";

export const MESSAGE_STYLES: { key: MessageStyle; label: string }[] = [
  { key: "consultivo", label: "Consultivo" },
  { key: "direto", label: "Direto" },
  { key: "proximo", label: "Próximo" },
  { key: "curto", label: "Curto" },
  { key: "pergunta", label: "Pergunta" },
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
  /** Acrescenta um paragrafo com os diferenciais da kreativ.ae. */
  includeAbout?: boolean;
  /** Nome de quem esta enviando — vem da conta logada. */
  senderName?: string | null;
}

/** Diferenciais da casa — texto curto o bastante para caber no WhatsApp. */
const SOBRE: Record<Locale, string[]> = {
  BR: [
    "Sobre a gente: atendemos empresas em mais de 7 países, criamos sites em qualquer idioma e não cobramos mensalidade. O site é seu, sem aluguel.",
    "Só para você situar: já atendemos clientes em mais de 7 países, trabalhamos em qualquer idioma e não existe mensalidade. Você paga uma vez e o site é seu.",
  ],
  PT: [
    "Sobre nós: trabalhamos com empresas em mais de 7 países, criamos sites em qualquer idioma e não cobramos mensalidade. O site fica vosso, sem alugueres.",
    "Só para situar: já trabalhámos com clientes em mais de 7 países, em qualquer idioma, e não há mensalidades. Paga uma vez e o site é vosso.",
  ],
};

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

const FUSO: Record<Locale, string> = {
  BR: "America/Sao_Paulo",
  PT: "Europe/Lisbon",
};

/**
 * Cumprimento pelo relogio DO LEAD, nao pelo seu. Portugal esta 4h a frente
 * de Brasilia: as 15h daqui ja e noite la, e "boa tarde" entregaria na hora
 * que o cumprimento fica errado.
 */
export function cumprimentoDoDia(country: string, agora = new Date()): string {
  const l: Locale = country === "PT" ? "PT" : "BR";
  let hora: number;
  try {
    hora = Number(
      new Intl.DateTimeFormat("pt-BR", {
        hour: "numeric",
        hourCycle: "h23",
        timeZone: FUSO[l],
      }).format(agora),
    );
  } catch {
    hora = agora.getHours();
  }
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 19) return "Boa tarde";
  return "Boa noite";
}

/** As variantes neutras convivem com as de horario, para o texto variar. */
const SAUDACOES: Record<Locale, ((nome: string | undefined, c: string) => string)[]> = {
  BR: [
    (n, c) => (n ? `${c}, ${n}! Tudo bem?` : `${c}! Tudo bem?`),
    (n) => (n ? `Oi, ${n}, tudo certo?` : "Oi! Tudo certo?"),
    (n, c) => (n ? `${c}, ${n}. Espero que esteja tudo bem.` : `${c}! Espero que esteja tudo bem.`),
    (n) => (n ? `Olá, ${n}! Tudo bem?` : "Olá! Tudo bem?"),
    (n, c) => (n ? `${c}, ${n}, como vai?` : `${c}! Como vai?`),
    (n) => (n ? `Olá, ${n}. Espero não incomodar.` : "Olá! Espero não incomodar."),
  ],
  PT: [
    (n, c) => (n ? `${c}, ${n}! Tudo bem?` : `${c}! Tudo bem?`),
    (n, c) => (n ? `${c}, ${n}. Espero que esteja tudo bem.` : `${c}! Espero que esteja tudo bem.`),
    (n) => (n ? `Olá, ${n}, como está?` : "Olá! Como está?"),
    (n) => (n ? `Olá, ${n}! Tudo bem?` : "Olá! Tudo bem?"),
    (n, c) => (n ? `${c}, ${n}. Espero não estar a incomodar.` : `${c}! Espero não estar a incomodar.`),
    (n, c) => (n ? `${c}, ${n}. Como tem passado?` : `${c}! Como tem passado?`),
  ],
};

/* ------------------------------------------------------------ apresentacao */

const APRESENTACOES: Record<
  Locale,
  Record<MessageStyle, ((nome: string | null) => string)[]>
> = {
  BR: {
    consultivo: [
      (n) =>
        n
          ? `Meu nome é ${n}, da kreativ.ae, estúdio especializado em criação de sites profissionais.`
          : "Aqui é da kreativ.ae, estúdio especializado em criação de sites profissionais.",
      (n) =>
        n
          ? `Meu nome é ${n} e falo da kreativ.ae, onde trabalhamos a presença digital de empresas como a sua.`
          : "Falo da kreativ.ae. Trabalhamos a presença digital de empresas como a sua.",
    ],
    direto: [
      (n) => (n ? `Meu nome é ${n}, da kreativ.ae. Criamos sites profissionais.` : "Sou da kreativ.ae, criamos sites profissionais."),
      (n) => (n ? `Aqui é o ${n}, da kreativ.ae, estúdio de criação de sites.` : "Aqui é da kreativ.ae, estúdio de criação de sites."),
    ],
    proximo: [
      (n) =>
        n
          ? `Meu nome é ${n}, sou da kreativ.ae, um estúdio que cria sites para empresas daqui da região.`
          : "Sou da kreativ.ae, um estúdio que cria sites para empresas daqui da região.",
      (n) =>
        n
          ? `Aqui é o ${n}, da kreativ.ae. A gente cria sites profissionais para empresas como a sua.`
          : "Aqui é da kreativ.ae. A gente cria sites profissionais para empresas como a sua.",
      (n) =>
        n
          ? `Meu nome é ${n} e trabalho na kreativ.ae, criando sites para quem quer aparecer melhor online.`
          : "Sou da kreativ.ae, criamos sites para quem quer aparecer melhor online.",
    ],
    curto: [
      (n) => (n ? `Meu nome é ${n}, da kreativ.ae, criamos sites profissionais.` : "Sou da kreativ.ae, criamos sites profissionais."),
      (n) => (n ? `${n}, da kreativ.ae, estúdio de sites.` : "Sou da kreativ.ae, estúdio de sites."),
    ],
    pergunta: [
      (n) => (n ? `Meu nome é ${n}, da kreativ.ae, estúdio de criação de sites.` : "Sou da kreativ.ae, estúdio de criação de sites."),
      (n) => (n ? `Aqui é o ${n}, da kreativ.ae. Trabalhamos com sites profissionais.` : "Aqui é da kreativ.ae. Trabalhamos com sites profissionais."),
    ],
  },
  PT: {
    consultivo: [
      // PT usa o artigo antes do possessivo: "o meu nome", nao "meu nome".
      (n) =>
        n
          ? `Chamo-me ${n}, da kreativ.ae, estúdio especializado na criação de sites profissionais.`
          : "Falo da kreativ.ae, estúdio especializado na criação de sites profissionais.",
      (n) =>
        n
          ? `O meu nome é ${n} e falo da kreativ.ae, onde trabalhamos a presença digital de empresas como a vossa.`
          : "Contacto-o da parte da kreativ.ae. Trabalhamos a presença digital de empresas como a vossa.",
    ],
    direto: [
      (n) => (n ? `Chamo-me ${n}, da kreativ.ae. Criamos sites profissionais.` : "Sou da kreativ.ae, criamos sites profissionais."),
      (n) => (n ? `O meu nome é ${n}, da kreativ.ae, estúdio de criação de sites.` : "Falo da kreativ.ae, estúdio de criação de sites."),
    ],
    proximo: [
      (n) =>
        n
          ? `Chamo-me ${n}, sou da kreativ.ae, um estúdio que cria sites para empresas como a vossa.`
          : "Sou da kreativ.ae, um estúdio que cria sites para empresas como a vossa.",
      (n) =>
        n
          ? `O meu nome é ${n}, da kreativ.ae. Ajudamos empresas a ter uma presença online à altura do trabalho que fazem.`
          : "Falo da kreativ.ae. Ajudamos empresas a ter uma presença online à altura do trabalho que fazem.",
      (n) =>
        n
          ? `Chamo-me ${n} e trabalho na kreativ.ae, a criar sites para quem quer marcar melhor presença online.`
          : "Sou da kreativ.ae, criamos sites para quem quer marcar melhor presença online.",
    ],
    curto: [
      (n) => (n ? `Chamo-me ${n}, da kreativ.ae, criamos sites profissionais.` : "Sou da kreativ.ae, criamos sites profissionais."),
      (n) => (n ? `${n}, da kreativ.ae, estúdio de sites.` : "Sou da kreativ.ae, estúdio de sites."),
    ],
    pergunta: [
      (n) => (n ? `Chamo-me ${n}, da kreativ.ae, estúdio de criação de sites.` : "Sou da kreativ.ae, estúdio de criação de sites."),
      (n) => (n ? `O meu nome é ${n}, da kreativ.ae. Trabalhamos com sites profissionais.` : "Falo da kreativ.ae. Trabalhamos com sites profissionais."),
    ],
  },
};

/* ----------------------------------------------------------------- ganchos */

function ganchoSemSite(l: Locale, style: MessageStyle, empresa: string, lugar: string, n: number): string {
  const BR = {
    consultivo: [
      `Estive pesquisando ${empresa}${lugar} e vi que vocês ainda não têm um site. Hoje o site é a vitrine do negócio: é onde o cliente vê o trabalho, entende o serviço e decide se confia, tudo isso antes de falar com vocês.`,
      `Encontrei ${empresa}${lugar} e notei que ainda não têm site próprio. Quando alguém se interessa pelo serviço, não existe um lugar organizado para mostrar o trabalho e explicar como funciona.`,
    ],
    direto: [
      `Vi que ${empresa} não tem site. Sem ele, o cliente não tem onde ver o trabalho de vocês antes de decidir.`,
      `Reparei que ${empresa}${lugar} não tem site. Falta uma vitrine para apresentar o serviço de forma organizada.`,
    ],
    proximo: [
      `Estava pesquisando empresas${lugar} e dei de cara com ${empresa}. Gostei do trabalho, mas fiquei com uma pena: não tem um site para mostrar isso direito.`,
      `Conheci ${empresa}${lugar} e achei o serviço bom. Só senti falta de um site, um lugar onde a pessoa veja o trabalho com calma e saiba como falar com vocês.`,
    ],
    curto: [
      `${empresa} ainda não tem site. Falta uma vitrine para mostrar o trabalho de vocês.`,
      `Vi que ${empresa} não tem site. É o lugar onde o cliente decide se confia.`,
      `${empresa} não tem site, e é ali que o cliente forma a primeira impressão.`,
    ],
    pergunta: [
      `Posso fazer uma pergunta rápida? Quando alguém quer conhecer o trabalho da ${empresa}, para onde vocês mandam a pessoa?`,
      `Uma dúvida sincera: como o cliente de vocês vê o trabalho da ${empresa} antes de fechar? Reparei que ainda não têm site.`,
      `Posso perguntar uma coisa? Hoje, quando alguém pede indicação da ${empresa}, o que vocês enviam para a pessoa conhecer o trabalho?`,
    ],
  };
  const PT = {
    consultivo: [
      `Estive a pesquisar ${empresa}${lugar} e vi que ainda não têm site. Hoje o site é a montra do negócio: é onde o cliente vê o trabalho, percebe o serviço e decide se confia, tudo isto antes de vos contactar.`,
      `Encontrei ${empresa}${lugar} e reparei que ainda não têm site próprio. Quando alguém se interessa, não há um sítio organizado para mostrar o trabalho e explicar como funciona.`,
    ],
    direto: [
      `Vi que ${empresa} não tem site. Sem ele, o cliente não tem onde ver o vosso trabalho antes de decidir.`,
      `Reparei que ${empresa}${lugar} não tem site. Falta uma montra para apresentar o serviço de forma organizada.`,
    ],
    proximo: [
      `Estava a pesquisar empresas${lugar} e encontrei ${empresa}. Gostei do trabalho, mas ficou-me uma pena: não têm um site para o mostrar como deve ser.`,
      `Conheci ${empresa}${lugar} e achei o serviço bom. Só senti falta de um site, um sítio onde a pessoa veja o trabalho com calma e saiba como vos contactar.`,
    ],
    curto: [
      `${empresa} ainda não tem site. Falta uma montra para mostrar o vosso trabalho.`,
      `Vi que ${empresa} não tem site. É onde o cliente decide se confia.`,
      `${empresa} não tem site, e é aí que o cliente forma a primeira impressão.`,
    ],
    pergunta: [
      `Posso fazer uma pergunta rápida? Quando alguém quer conhecer o trabalho da ${empresa}, para onde encaminham a pessoa?`,
      `Uma dúvida sincera: como é que o cliente vê o trabalho da ${empresa} antes de fechar? Reparei que ainda não têm site.`,
      `Posso perguntar uma coisa? Hoje, quando alguém pede referência da ${empresa}, o que enviam para a pessoa conhecer o trabalho?`,
    ],
  };
  return pick((l === "PT" ? PT : BR)[style], n);
}

function ganchoSiteFraco(l: Locale, style: MessageStyle, empresa: string, n: number): string {
  const BR = {
    consultivo: [
      `Visitei o site da ${empresa} e gostei do trabalho de vocês. Vi alguns pontos que, ajustados, fariam o visitante chegar bem mais rápido ao que procura, e isso costuma virar contato.`,
      `Dei uma olhada no site da ${empresa}. A base está lá; o que eu vejo é espaço para deixar a navegação mais direta e aproveitar melhor quem já visita a página.`,
      `Entrei no site da ${empresa} e reparei em algumas oportunidades de melhoria, pequenas mudanças na estrutura que costumam aumentar bastante o número de contatos.`,
    ],
    direto: [
      `Olhei o site da ${empresa} e vi espaço para melhorar a experiência de quem visita, o tipo de ajuste que costuma render mais contatos.`,
      `O site da ${empresa} tem uma base boa. Com alguns ajustes de navegação, ele converteria bem mais.`,
      `Vi o site da ${empresa} e identifiquei alguns pontos de melhoria que fariam diferença no resultado.`,
    ],
    proximo: [
      `Entrei no site da ${empresa} e achei que dá para tirar bem mais proveito dele. O trabalho de vocês merece uma vitrine à altura.`,
      `Fui olhar o site da ${empresa} com calma. Tem coisa boa ali, e algumas melhorias simples deixariam a experiência bem mais fluida.`,
      `Dei uma passada no site da ${empresa} e fiquei pensando em algumas ideias que poderiam render mais contatos para vocês.`,
    ],
    curto: [
      `Vi o site da ${empresa} e tem alguns pontos de melhoria que renderiam mais contatos.`,
      `Olhei o site da ${empresa}: dá para deixar a navegação bem mais direta.`,
    ],
    pergunta: [
      `Posso te fazer uma pergunta? O site da ${empresa} tem trazido o número de contatos que vocês esperam? Vi alguns pontos que poderiam melhorar isso.`,
      `Uma pergunta rápida: quantos clientes chegam até vocês pelo site hoje? Olhei ele e vi espaço para esse número crescer.`,
    ],
  };
  const PT = {
    consultivo: [
      `Visitei o site da ${empresa} e gostei do vosso trabalho. Notei alguns pontos que, ajustados, fariam o visitante chegar mais depressa ao que procura, e isso costuma traduzir-se em contactos.`,
      `Dei uma vista de olhos no site da ${empresa}. A base está lá; o que vejo é margem para tornar a navegação mais direta e aproveitar melhor quem já visita a página.`,
      `Entrei no site da ${empresa} e reparei em algumas oportunidades de melhoria, mudanças simples na estrutura que costumam aumentar bastante os contactos.`,
    ],
    direto: [
      `Vi o site da ${empresa} e há margem para melhorar a experiência de quem visita, o tipo de ajuste que costuma render mais contactos.`,
      `O site da ${empresa} tem uma boa base. Com alguns ajustes de navegação, converteria bastante mais.`,
      `Vi o site da ${empresa} e identifiquei alguns pontos de melhoria que fariam diferença no resultado.`,
    ],
    proximo: [
      `Entrei no site da ${empresa} e achei que se pode tirar bastante mais partido dele. O vosso trabalho merece uma montra à altura.`,
      `Fui ver o site da ${empresa} com calma. Há coisa boa ali, e algumas melhorias simples tornariam a experiência bem mais fluida.`,
      `Passei pelo site da ${empresa} e fiquei a pensar nalgumas ideias que poderiam render mais contactos.`,
    ],
    curto: [
      `Vi o site da ${empresa} e há pontos de melhoria que renderiam mais contactos.`,
      `Vi o site da ${empresa}: dá para tornar a navegação bem mais direta.`,
    ],
    pergunta: [
      `Posso fazer-lhe uma pergunta? O site da ${empresa} tem trazido os contactos que esperam? Notei alguns pontos que poderiam melhorar isso.`,
      `Uma pergunta rápida: quantos clientes vos chegam hoje pelo site? Vi-o e há margem para esse número crescer.`,
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
    BR: "ele não está adaptado para celular, e quem abre pelo telefone precisa dar zoom e arrastar a tela para conseguir ler",
    PT: "não está adaptado a telemóveis, e quem o abre pelo telefone tem de ampliar e arrastar o ecrã para conseguir ler",
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
  slow: {
    BR: "a página carrega devagar, e boa parte das pessoas desiste antes de ela abrir",
    PT: "a página demora a carregar, e boa parte das pessoas desiste antes de abrir",
  },
  social: {
    BR: "quando alguém compartilha o link no WhatsApp, ele aparece sem imagem",
    PT: "quando alguém partilha a ligação no WhatsApp, aparece sem imagem",
  },
  reachable: {
    BR: "o site simplesmente não está no ar, talvez por hospedagem vencida ou domínio expirado",
    PT: "o site não está no ar, talvez por alojamento vencido ou domínio expirado",
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
  // Ordenado por impacto para quem visita o site. Achados puramente de SEO
  // ficam de fora: o argumento aqui e navegabilidade, nao ranqueamento.
  const ordem = ["reachable", "flash", "responsive", "https", "slow", "freshness", "tables", "social"];
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
          curto: [`No site da ${empresa} encontrei dois problemas:`],
          pergunta: [`Posso ser direto? Analisei o site da ${empresa} e encontrei dois pontos que provavelmente estão a custar contactos:`],
        }
      : {
          consultivo: [`Fiz uma análise técnica do site da ${empresa} e encontrei dois pontos concretos:`, `Analisei o site da ${empresa} e há dois problemas que saltam aos olhos:`],
          direto: [`Analisei o site da ${empresa}. Dois problemas:`, `Passei o site da ${empresa} por uma análise técnica. O que achei:`],
          proximo: [`Fui olhar o site da ${empresa} com calma e reparei em duas coisas:`, `Dei uma olhada técnica no site da ${empresa} e notei o seguinte:`],
          curto: [`No site da ${empresa} achei dois problemas:`],
          pergunta: [`Posso ser direto? Analisei o site da ${empresa} e achei dois pontos que provavelmente estão custando contatos:`],
        };

  return `${pick(aberturas[style], n)} ${lista}.`;
}

/* --------------------------------------------------------------------- cta */

type Situacao = "comSite" | "semSite";

/**
 * A oferta muda conforme o lead: quem tem site recebe proposta de
 * reformulacao; quem nao tem, de criacao. Em ambos os casos o pedido e uma
 * reuniao curta para mostrar modelos — pedir 10 minutos e mais facil de
 * aceitar do que um "diagnostico", que soa a trabalho para o cliente.
 */
const CTAS: Record<Locale, Record<Situacao, Record<MessageStyle, string[]>>> = {
  BR: {
    comSite: {
      consultivo: [
        "Podemos fazer uma reformulação completa do site de vocês. Se quiser, marco uma reunião de 10 minutos para apresentar alguns modelos, sem compromisso.",
        "O que proponho é um redesign do site atual. Posso marcar 10 minutos para te mostrar alguns modelos e você avaliar com calma?",
      ],
      direto: [
        "Faz sentido marcarmos 10 minutos para eu mostrar alguns modelos de redesign?",
        "Consigo mostrar em 10 minutos como o site de vocês ficaria reformulado. Topa?",
      ],
      proximo: [
        "Se quiser, a gente marca uns 10 minutinhos e eu te mostro alguns modelos de como ficaria. Sem compromisso nenhum.",
        "Posso te mostrar numa conversa rápida, uns 10 minutos, alguns modelos de redesign. O que acha?",
      ],
      curto: [
        "Topa 10 minutos para eu mostrar alguns modelos de redesign?",
        "Consigo mostrar em 10 minutos como ficaria. Quer ver?",
      ],
      pergunta: [
        "Posso te mostrar alguns modelos de redesign numa reunião de 10 minutos?",
        "Se eu marcar 10 minutos para mostrar como o site ficaria reformulado, você dá uma olhada?",
      ],
    },
    semSite: {
      consultivo: [
        "Podemos criar o site de vocês do zero. Se fizer sentido, marco uma reunião de 10 minutos para apresentar alguns modelos, sem compromisso.",
        "O que proponho é criar um site próprio para vocês. Posso marcar 10 minutos para te mostrar alguns modelos?",
      ],
      direto: [
        "Faz sentido marcarmos 10 minutos para eu mostrar alguns modelos?",
        "Consigo mostrar em 10 minutos como ficaria o site de vocês. Topa?",
      ],
      proximo: [
        "Se quiser, a gente marca uns 10 minutinhos e eu te mostro alguns modelos de como ficaria. Sem compromisso nenhum.",
        "Posso te mostrar numa conversa rápida, uns 10 minutos, alguns modelos de site. O que acha?",
      ],
      curto: [
        "Topa 10 minutos para eu mostrar alguns modelos?",
        "Consigo mostrar em 10 minutos como ficaria. Quer ver?",
      ],
      pergunta: [
        "Posso te mostrar em 10 minutos como ficaria o site de vocês?",
        "Se eu marcar 10 minutos para mostrar alguns modelos, você dá uma olhada?",
      ],
    },
  },
  PT: {
    comSite: {
      consultivo: [
        "Podemos fazer uma reformulação completa do vosso site. Se quiser, marcamos uma reunião de 10 minutos para vos apresentar alguns modelos, sem qualquer compromisso.",
        "O que proponho é um redesign do site atual. Marcamos 10 minutos para lhe mostrar alguns modelos e avaliar com calma?",
      ],
      direto: [
        "Faz sentido marcarmos 10 minutos para vos mostrar alguns modelos de reformulação?",
        "Em 10 minutos consigo mostrar-lhe como o vosso site ficaria reformulado. Interessa?",
      ],
      proximo: [
        "Se quiser, marcamos 10 minutos e mostro-lhe alguns modelos de como poderia ficar. Sem qualquer compromisso.",
        "Posso mostrar-lhe numa conversa rápida, uns 10 minutos, alguns modelos de reformulação. O que acha?",
      ],
      curto: [
        "Marcamos 10 minutos para lhe mostrar alguns modelos?",
        "Em 10 minutos mostro-lhe como poderia ficar. Interessa?",
      ],
      pergunta: [
        "Posso mostrar-lhe alguns modelos de reformulação numa reunião de 10 minutos?",
        "Se marcarmos 10 minutos para lhe mostrar como o site ficaria, dá uma vista de olhos?",
      ],
    },
    semSite: {
      consultivo: [
        "Podemos criar o vosso site de raiz. Se fizer sentido, marcamos uma reunião de 10 minutos para vos apresentar alguns modelos, sem qualquer compromisso.",
        "O que proponho é criar um site próprio para a vossa empresa. Marcamos 10 minutos para lhe mostrar alguns modelos?",
      ],
      direto: [
        "Faz sentido marcarmos 10 minutos para vos mostrar alguns modelos?",
        "Em 10 minutos consigo mostrar-lhe como ficaria o vosso site. Interessa?",
      ],
      proximo: [
        "Se quiser, marcamos 10 minutos e mostro-lhe alguns modelos de como poderia ficar. Sem qualquer compromisso.",
        "Posso mostrar-lhe numa conversa rápida, uns 10 minutos, alguns modelos de site. O que acha?",
      ],
      curto: [
        "Marcamos 10 minutos para lhe mostrar alguns modelos?",
        "Em 10 minutos mostro-lhe como poderia ficar. Interessa?",
      ],
      pergunta: [
        "Posso mostrar-lhe em 10 minutos como ficaria o vosso site?",
        "Se marcarmos 10 minutos para lhe mostrar alguns modelos, dá uma vista de olhos?",
      ],
    },
  },
};

const FECHOS: Record<Locale, string[]> = {
  BR: [
    "Fica o convite. Obrigado!",
    "Qualquer coisa, é só chamar. Obrigado!",
    "Fico à disposição. Obrigado!",
    "Se fizer sentido, me avisa. Obrigado pela atenção!",
    "Obrigado pela atenção, e bom trabalho por aí!",
  ],
  PT: [
    "Fica o convite. Obrigado!",
    "Fico ao dispor. Obrigado!",
    "Qualquer questão, diga. Obrigado!",
    "Se fizer sentido, é só dizer. Obrigado pela atenção!",
    "Obrigado pela atenção, e bom trabalho!",
  ],
};

/* ------------------------------------------------------------------ montagem */

/**
 * Devolve a mensagem em partes. Mandar 4 mensagens curtas em sequencia soa
 * como alguem digitando; um bloco unico soa como disparo automatico.
 */
export function buildWhatsappParts(
  lead: MessageLead,
  opts: MessageOptions = {},
): string[] {
  const l: Locale = lead.country === "PT" ? "PT" : "BR";
  const variant = opts.variant ?? 0;
  const base = seed(`${lead.id}:${variant}`);
  const style = opts.style ?? pick(MESSAGE_STYLES, base).key;

  const primeiroNome = lead.ownerName?.trim().split(/\s+/)[0];
  const empresa = lead.companyName;
  const lugar = lead.city ? ` em ${lead.city}` : "";

  const saudacao = pick(SAUDACOES[l], base)(
    primeiroNome,
    cumprimentoDoDia(lead.country),
  );
  const apresentacao = pick(APRESENTACOES[l][style], base >> 3)(
    opts.senderName?.trim() || null,
  );

  let gancho: string | null = null;
  if (opts.useAnalysis && lead.websiteChecks?.length) {
    gancho = ganchoDiagnostico(l, style, empresa, lead.websiteChecks, base >> 5);
  }
  if (!gancho) {
    gancho = !lead.website
      ? ganchoSemSite(l, style, empresa, lugar, base >> 5)
      : ganchoSiteFraco(l, style, empresa, base >> 5);
  }

  const situacao: Situacao = lead.website ? "comSite" : "semSite";
  const cta = pick(CTAS[l][situacao][style], base >> 7);

  const partes = [saudacao, apresentacao, gancho];
  if (opts.includeAbout) partes.push(pick(SOBRE[l], base >> 11));
  partes.push(cta);
  // O estilo "curto" existe para caber em poucas linhas: um paragrafo de
  // despedida derrubaria justamente o que ele tem de util.
  if (style !== "curto") partes.push(pick(FECHOS[l], base >> 9));

  return partes;
}

export function buildWhatsappMessage(
  lead: MessageLead,
  opts: MessageOptions = {},
): string {
  return buildWhatsappParts(lead, opts).join("\n\n");
}

/** Assunto do e-mail: acompanha o gancho, sem parecer disparo em massa. */
export function emailSubject(lead: {
  companyName: string;
  website: string | null;
}): string {
  return lead.website
    ? `Sobre o site da ${lead.companyName}`
    : `Sobre a presença digital da ${lead.companyName}`;
}

export function mailtoLink(
  email: string | null,
  subject: string,
  body: string,
): string | null {
  if (!email) return null;
  // O endereco vai cru: codificar o "@" como %40 e valido pela RFC 6068, mas
  // clientes de e-mail antigos tropecam. So o que quebraria a URL sai.
  const destino = email.trim().replace(/[\s<>"'`]/g, "");
  if (!destino.includes("@")) return null;
  return `mailto:${destino}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}

export function waMeLink(
  whatsappDigits: string | null,
  message: string,
): string | null {
  if (!whatsappDigits) return null;
  return `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(message)}`;
}
