import { describe, expect, it } from "vitest";
import { extrairCandidato, extrairEmails, extrairTelefones, temContato } from "./dork-extract";

describe("extrairCandidato", () => {
  it("perfil do Instagram: handle, nome limpo, e-mail e WhatsApp do trecho", () => {
    const c = extrairCandidato(
      {
        title: "Dra. Ana Souza (@anasouza.adv) • Instagram photos and videos",
        link: "https://www.instagram.com/anasouza.adv/",
        snippet:
          "Advogada trabalhista em São Paulo. Contato: anasouza.adv@gmail.com | (11) 98765-4321",
      },
      { city: "São Paulo", categoria: "advogado" },
    );
    expect(c.osmId).toBe("ig:anasouza.adv");
    expect(c.companyName).toBe("Dra. Ana Souza");
    expect(c.instagram).toBe("https://instagram.com/anasouza.adv");
    expect(c.email).toBe("anasouza.adv@gmail.com");
    expect(c.whatsapp).toBe("5511987654321");
    expect(c.whatsappSource).toBe("inferred");
    expect(c.website).toBeNull();
    expect(c.city).toBe("São Paulo");
    expect(c.categoryRaw).toBe("advogado");
    expect(temContato(c)).toBe(true);
  });

  it("link wa.me conta como WhatsApp declarado, mesmo sendo fixo", () => {
    const c = extrairCandidato({
      title: "Clínica Sorriso | Dentista em Campinas",
      link: "https://clinicasorriso.wixsite.com/site",
      snippet: "Agende pelo wa.me/551932345678 ou ligue (19) 3234-5678.",
    });
    expect(c.whatsapp).toBe("551932345678");
    expect(c.whatsappSource).toBe("declared");
    expect(c.phone).toBe("1932345678");
    expect(c.website).toBe("https://clinicasorriso.wixsite.com/site");
    expect(c.osmId).toBe("web:clinicasorriso.wixsite.com/site");
  });

  it("post do Instagram (/p/) não vira handle", () => {
    const c = extrairCandidato({
      title: "Instagram",
      link: "https://www.instagram.com/p/C1abc/",
      snippet: "sem contato",
    });
    expect(c.instagramHandle).toBeNull();
    expect(temContato(c)).toBe(false);
  });

  it("LinkedIn vai no campo linkedin e tira o sufixo do título", () => {
    const c = extrairCandidato({
      title: "João Lima - Advogado Tributarista - LinkedIn",
      link: "https://br.linkedin.com/in/joaolima",
    });
    expect(c.linkedin).toBe("https://br.linkedin.com/in/joaolima");
    expect(c.companyName).toBe("João Lima - Advogado Tributarista");
    expect(c.website).toBeNull();
  });
});

describe("extratores", () => {
  it("e-mails: minúsculos, sem ponto final e sem imagens", () => {
    expect(extrairEmails("Fale: Contato@Escritorio.com.br. logo@2x.png")).toEqual([
      "contato@escritorio.com.br",
    ]);
  });

  it("telefones: vários formatos, sem repetir", () => {
    expect(
      extrairTelefones("+55 11 98765-4321 · 11987654321 · (21) 2345-6789 · CEP 01310-100"),
    ).toEqual(["11987654321", "2123456789"]);
  });

  it("telefones de Portugal: 9 dígitos, com ou sem +351", () => {
    expect(extrairTelefones("Ligue +351 912 345 678 ou 21 234 5678", "PT")).toEqual([
      "912345678",
      "212345678",
    ]);
  });
});

describe("Portugal", () => {
  it("celular português vira WhatsApp com 351", () => {
    const c = extrairCandidato(
      {
        title: "Dra. Rita Alves (@ritaalves.adv) • Instagram",
        link: "https://www.instagram.com/ritaalves.adv/",
        snippet: "Advogada em Lisboa · rita@sapo.pt · 912 345 678",
      },
      { pais: "PT", city: "Lisboa" },
    );
    expect(c.whatsapp).toBe("351912345678");
    expect(c.email).toBe("rita@sapo.pt");
  });
});
