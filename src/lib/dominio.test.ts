import { describe, expect, it } from "vitest";
import { dominioRegistravel } from "./dominio";

describe("dominioRegistravel", () => {
  it("tira www, protocolo, caminho e porta", () => {
    expect(dominioRegistravel("www.kreativ.ae")).toBe("kreativ.ae");
    expect(dominioRegistravel("https://www.kreativ.ae/contato?x=1")).toBe("kreativ.ae");
    expect(dominioRegistravel("HTTP://Kreativ.AE:8080/")).toBe("kreativ.ae");
    expect(dominioRegistravel("kreativ.ae.")).toBe("kreativ.ae");
  });
  it("mantém três partes em sufixos de segundo nível", () => {
    expect(dominioRegistravel("www.empresa.com.br")).toBe("empresa.com.br");
    expect(dominioRegistravel("blog.empresa.com.br")).toBe("empresa.com.br");
    expect(dominioRegistravel("empresa.adv.br")).toBe("empresa.adv.br");
    expect(dominioRegistravel("loja.empresa.co.uk")).toBe("empresa.co.uk");
  });
  it("subdomínio comum vira o domínio", () => {
    expect(dominioRegistravel("loja.kreativ.ae")).toBe("kreativ.ae");
    expect(dominioRegistravel("app.empresa.com")).toBe("empresa.com");
    expect(dominioRegistravel("empresa.pt")).toBe("empresa.pt");
  });
});
