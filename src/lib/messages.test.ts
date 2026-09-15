import { describe, expect, test } from "vitest";
import {
  ASSINATURA_CARGO,
  buildWhatsappMessage,
  emailSubject,
  mailtoLink,
  textoParaHtmlEmail,
  waMeLink,
  type MessageLead,
} from "./messages";

function lead(overrides: Partial<MessageLead> = {}): MessageLead {
  return {
    id: "lead-teste",
    companyName: "Padaria Teste",
    ownerName: null,
    city: "Londrina",
    country: "BR",
    website: null,
    websiteGrade: null,
    websiteChecks: null,
    ...overrides,
  };
}

describe("buildWhatsappMessage — situação do lead (tem site ou não)", () => {
  // Regressão do bug real: o n8n mandava "ainda não tem site" pra leads
  // que já tinham site, porque a mensagem vinha de um template genérico em
  // vez do gerador real. O gerador em si (aqui testado) sempre respeitou
  // essa distinção; é ele que precisa continuar em uso em todo lugar.
  test("lead sem site menciona a ausência de site", () => {
    const msg = buildWhatsappMessage(lead({ website: null }), {
      style: "direto",
      forcarIndices: { gancho: 0 },
    });
    expect(msg.toLowerCase()).toContain("não tem site");
  });

  test("lead com site nunca afirma que o lead não tem site", () => {
    const msg = buildWhatsappMessage(lead({ website: "https://padariateste.com" }), {
      style: "direto",
      forcarIndices: { gancho: 0 },
    });
    expect(msg.toLowerCase()).not.toContain("não tem site");
  });
});

describe("buildWhatsappMessage — assinatura", () => {
  test("sem includeSignature, não leva o bloco de assinatura", () => {
    const msg = buildWhatsappMessage(lead(), { senderName: "Fabio" });
    expect(msg).not.toContain(ASSINATURA_CARGO);
  });

  test("com includeSignature, leva o bloco de assinatura", () => {
    const msg = buildWhatsappMessage(lead(), {
      includeSignature: true,
      senderName: "Fabio",
    });
    expect(msg).toContain(ASSINATURA_CARGO);
  });
});

describe("buildWhatsappMessage — determinismo", () => {
  test("mesmo lead e mesma variante sempre geram o mesmo texto", () => {
    const opts = { style: "consultivo" as const, variant: 3 };
    const a = buildWhatsappMessage(lead(), opts);
    const b = buildWhatsappMessage(lead(), opts);
    expect(a).toBe(b);
  });

  test("variantes diferentes tendem a gerar textos diferentes", () => {
    const a = buildWhatsappMessage(lead(), { style: "consultivo", variant: 0 });
    const b = buildWhatsappMessage(lead(), { style: "consultivo", variant: 1 });
    expect(a).not.toBe(b);
  });
});

describe("emailSubject", () => {
  test("lead sem site: assunto oferece um site", () => {
    expect(emailSubject({ companyName: "Padaria Teste", website: null })).toBe(
      "Um site para a Padaria Teste",
    );
  });

  test("lead com site: assunto fala sobre o site existente", () => {
    expect(
      emailSubject({ companyName: "Padaria Teste", website: "https://padariateste.com" }),
    ).toBe("Sobre o site da Padaria Teste");
  });
});

describe("mailtoLink", () => {
  test("sem e-mail, devolve null", () => {
    expect(mailtoLink(null, "Assunto", "Corpo")).toBeNull();
  });

  test("e-mail sem @, devolve null", () => {
    expect(mailtoLink("nao-e-email", "Assunto", "Corpo")).toBeNull();
  });

  test("e-mail válido monta o link com assunto e corpo", () => {
    const link = mailtoLink("lead@empresa.com", "Assunto", "Corpo");
    expect(link).toContain("mailto:lead@empresa.com");
    expect(link).toContain("subject=Assunto");
  });
});

describe("waMeLink", () => {
  test("sem número, devolve null", () => {
    expect(waMeLink(null, "Oi")).toBeNull();
  });

  test("com número, monta o link wa.me", () => {
    const link = waMeLink("5511999998888", "Oi");
    expect(link).toBe("https://wa.me/5511999998888?text=Oi");
  });
});

describe("textoParaHtmlEmail", () => {
  test("linhas ficam separadas por <br>", () => {
    const html = textoParaHtmlEmail("Primeira linha\nSegunda linha");
    expect(html).toContain("Primeira linha<br>Segunda linha");
  });

  test("escapa marcação HTML do texto original", () => {
    const html = textoParaHtmlEmail("Preço < 10 & > 5");
    expect(html).not.toContain("< 10");
    expect(html).toContain("&lt;");
  });
});
