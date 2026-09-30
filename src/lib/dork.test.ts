import { describe, expect, it } from "vitest";
import {
  DORK_VAZIO,
  contarPalavras,
  corrigirComando,
  montarDork,
  sugerirSinonimos,
  validarDork,
} from "./dork";

describe("montarDork", () => {
  it("monta grupos com OR, aspas onde precisa e site:", () => {
    const cmd = montarDork({
      ...DORK_VAZIO,
      nicho: ["advogado", "escritório de advocacia"],
      emails: ["@gmail.com", "@hotmail.com"],
      cidade: ["São Paulo"],
      plataformas: ["instagram"],
      excluir: ["vaga", "estágio remunerado"],
    });
    expect(cmd).toBe(
      '(advogado OR "escritório de advocacia") ("@gmail.com" OR "@hotmail.com") "São Paulo" site:instagram.com -vaga -"estágio remunerado"',
    );
  });

  it("junta várias plataformas num grupo OR", () => {
    const cmd = montarDork({ ...DORK_VAZIO, nicho: ["dentista"], plataformas: ["instagram", "linktree"] });
    expect(cmd).toBe("dentista (site:instagram.com OR site:linktr.ee)");
  });

  it("troca aspas curvas e ignora termos vazios", () => {
    const cmd = montarDork({ ...DORK_VAZIO, nicho: ["“clínica odontológica”", "  "] });
    expect(cmd).toBe('"clínica odontológica"');
  });
});

describe("contarPalavras", () => {
  it("não conta OR nem parênteses; conta cada palavra entre aspas", () => {
    expect(contarPalavras('(advogado OR "escritório de advocacia") site:instagram.com')).toBe(5);
  });
});

describe("validarDork", () => {
  it("avisa quando passa de 32 palavras", () => {
    const input = { ...DORK_VAZIO, nicho: Array.from({ length: 40 }, (_, i) => `termo${i}`) };
    const avisos = validarDork(input, montarDork(input));
    expect(avisos.some((a) => a.texto.includes("32"))).toBe(true);
  });

  it("dá ok quando está tudo certo", () => {
    const input = { ...DORK_VAZIO, nicho: ["advogado"] };
    expect(validarDork(input, montarDork(input))).toEqual([
      { tipo: "ok", texto: expect.any(String) },
    ]);
  });
});

describe("corrigirComando", () => {
  it("conserta o exemplo com aspas curvas, AND e parêntese aberto", () => {
    const { texto, correcoes } = corrigirComando(
      "Advogado (“@icloud.com” OR “@gmail.com” OR “@hotmail.com” AND São Paulo site:instagram.com",
    );
    expect(texto).toBe(
      'Advogado ("@icloud.com" OR "@gmail.com" OR "@hotmail.com") São Paulo site:instagram.com',
    );
    expect(correcoes).toHaveLength(3);
  });

  it("não mexe em and/or dentro de frase exata", () => {
    expect(corrigirComando('"rock and roll" or jazz').texto).toBe('"rock and roll" OR jazz');
  });

  it("remove parêntese fechando sem abrir e fecha aspas", () => {
    const { texto } = corrigirComando('a) "b');
    expect(texto).toBe('a "b"');
  });

  it("comando já correto volta igual e sem correções", () => {
    const ok = '(a OR b) "c d" site:x.com -e';
    expect(corrigirComando(ok)).toEqual({ texto: ok, correcoes: [] });
  });
});

describe("sugerirSinonimos", () => {
  it("sugere sem repetir o que já está e ignora acento", () => {
    expect(sugerirSinonimos(["Psicólogo", "terapeuta"])).toEqual(["psicóloga", "psicologia"]);
  });
});
