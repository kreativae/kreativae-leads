export function buildWhatsappMessage(lead: {
  companyName: string;
  ownerName: string | null;
  city: string | null;
  website: string | null;
  websiteGrade: string | null;
}): string {
  const firstName = lead.ownerName?.trim().split(/\s+/)[0];
  const greeting = firstName
    ? `Olá, ${firstName}. Tudo bem?`
    : "Olá, tudo bem?";
  const place = lead.city ? ` em ${lead.city}` : "";

  let hook: string;
  if (!lead.website) {
    hook = `Estive pesquisando ${lead.companyName}${place} e percebi que vocês ainda não têm um site próprio. Hoje, a maioria dos clientes pesquisa no Google antes de contratar — e quem não aparece, perde a venda para o concorrente.`;
  } else if (lead.websiteGrade && lead.websiteGrade !== "modern") {
    hook = `Visitei o site da ${lead.companyName} e notei que ele está desatualizado: não está otimizado para celular e foge dos padrões que o Google prioriza hoje. Isso pode estar custando contatos novos todos os dias.`;
  } else {
    hook = `Encontrei a ${lead.companyName}${place} e vi uma oportunidade real de fortalecer ainda mais a presença digital de vocês e gerar mais contatos.`;
  }

  return `${greeting}

Aqui é da kreativ.ae — estúdio especializado em criação de sites profissionais.

${hook}

Posso te mostrar em 2 minutos, sem compromisso, como um site moderno transformaria a captação de clientes da ${lead.companyName}? Preparamos um diagnóstico gratuito.

Fica o convite. Obrigado!`;
}

export function waMeLink(
  whatsappDigits: string | null,
  message: string,
): string | null {
  if (!whatsappDigits) return null;
  return `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(message)}`;
}
