import { describe, expect, test } from "vitest";
import { buildAutomationContent } from "./automation";
import { ASSINATURA_CARGO, type MessageLead } from "./messages";

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

describe("buildAutomationContent", () => {
  // Regressão do bug real de hoje: a automação mandava um template fixo
  // ("ainda não tem site") pra qualquer lead, mesmo quem já tinha site.
  // O conteúdo real da automação precisa sempre vir daqui — que já respeita
  // a situação do lead — nunca de um texto hardcoded em outro lugar.
  test("lead com site: nenhum dos campos afirma que ele não tem site", () => {
    const { message, subject, html } = buildAutomationContent(
      lead({ website: "https://padariateste.com" }),
      "Fabio",
    );
    expect(message.toLowerCase()).not.toContain("não tem site");
    expect(subject).toBe("Sobre o site da Padaria Teste");
    expect(html.toLowerCase()).not.toContain("não tem site");
  });

  test("lead sem site: mensagem menciona a ausência de site", () => {
    const { message, subject } = buildAutomationContent(lead({ website: null }), "Fabio");
    expect(subject).toBe("Um site para a Padaria Teste");
    expect(message.toLowerCase()).toContain("site");
  });

  test("mensagem de WhatsApp não leva assinatura; o e-mail (html) leva", () => {
    const { message, html } = buildAutomationContent(lead(), "Fabio Henrique");
    expect(message).not.toContain(ASSINATURA_CARGO);
    expect(html).toContain(ASSINATURA_CARGO);
  });

  test("usa o diagnóstico do site quando há checks coletados", () => {
    const comDiagnostico = buildAutomationContent(
      lead({
        website: "https://padariateste.com",
        websiteChecks: [
          { id: "https", label: "HTTPS", status: "fail", detail: "Sem certificado válido" },
        ],
      }),
      "Fabio",
    );
    const semDiagnostico = buildAutomationContent(
      lead({ website: "https://padariateste.com", websiteChecks: [] }),
      "Fabio",
    );
    // Não é sobre o texto exato (varia por estilo/hash) — é sobre usar
    // caminhos de geração diferentes quando o diagnóstico está disponível.
    expect(comDiagnostico.message).not.toBe(semDiagnostico.message);
  });
});
