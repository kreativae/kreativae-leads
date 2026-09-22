import net from "node:net";

/**
 * Fallback pro RDAP: cobre TLDs sem servidor RDAP publico (ex.: .pt) usando
 * o protocolo WHOIS classico (porta 43). Achado e verificado na pratica:
 * whois.iana.org devolve, pra qualquer TLD, uma linha "whois: <servidor>"
 * apontando pro servidor de verdade — mesma ideia de bootstrap do RDAP, so
 * que mais antiga e sem JSON (texto livre, formato varia por registro).
 */
export interface WhoisResult {
  domain: string;
  disponivel: boolean;
  registrar?: string | null;
  criadoEm?: string | null;
  expiraEm?: string | null;
  atualizadoEm?: string | null;
  status?: string[];
  nameservers?: string[];
  proprietario?: string | null;
  organizacao?: string | null;
}

function whoisQuery(server: string, query: string, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    let data = "";
    const socket = net.createConnection({ host: server, port: 43 }, () => {
      socket.write(query + "\r\n");
    });
    socket.setTimeout(timeoutMs);
    socket.on("data", (chunk) => {
      data += chunk.toString("utf8");
    });
    // "timeout" resolve com o que tiver ate ali (pode ser string vazia) em
    // vez de rejeitar — alguns servidores demoram ou ficam em silencio, e
    // quem chama decide o que uma resposta vazia significa.
    const finalizar = () => resolve(data);
    socket.on("end", finalizar);
    socket.on("close", finalizar);
    socket.on("timeout", () => {
      socket.destroy();
      finalizar();
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(null);
    });
  });
}

function extrairServidorWhois(respostaIana: string): string | null {
  const m = respostaIana.match(/^whois:\s*(\S+)/im);
  return m ? m[1] : null;
}

const FRASES_NAO_ENCONTRADO =
  /no match|not found|no entries found|no data found|no object found|status:\s*available|domain not registered/i;

/** "30/10/2002 00:00:00" (comum em WHOIS europeu) -> ISO, sem inventar timezone. */
function normalizarData(bruto: string): string | null {
  const v = bruto.trim();
  if (!v) return null;
  const dmy = v.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/);
  if (dmy) {
    const [, dd, mm, yyyy, hh = "00", mi = "00", ss = "00"] = dmy;
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}Z`;
  }
  // Já parece ISO ou outro formato que o Date do navegador entende sozinho.
  return v;
}

function primeiroCampo(texto: string, ...labels: string[]): string | null {
  for (const label of labels) {
    const m = texto.match(new RegExp(`^${label}:\\s*(.+)$`, "im"));
    if (m && m[1].trim()) return m[1].trim();
  }
  return null;
}

/**
 * Parser generico "melhor esforço": WHOIS nao tem schema unico como o
 * RDAP, cada registro rotula os campos do seu jeito. Cobre o formato do
 * whois.dns.pt (verificado ao vivo) e tenta rotulos comuns de outros
 * registros — pode nao pegar tudo em TLDs nunca testados.
 */
function parseWhoisGenerico(texto: string): Omit<WhoisResult, "domain" | "disponivel"> {
  const nameservers = [...texto.matchAll(/^Name Server:\s*(.+)$/gim)]
    .map((m) => m[1].trim().split(/[\s|]+/)[0])
    .filter((n) => n.length > 0);
  const status = [...texto.matchAll(/^(?:Domain )?Status:\s*(.+)$/gim)].map((m) => m[1].trim());

  const criado = primeiroCampo(texto, "Creation Date", "Registered On", "Created(?: On)?", "Registration Date");
  const expira = primeiroCampo(texto, "Expiration Date", "Expiry Date", "Registry Expiry Date", "Expires? On");
  const atualizado = primeiroCampo(texto, "Updated Date", "Last Modified", "Last Updated(?: On)?");

  return {
    registrar: primeiroCampo(texto, "Registrar(?: Name)?"),
    criadoEm: criado ? normalizarData(criado) : null,
    expiraEm: expira ? normalizarData(expira) : null,
    atualizadoEm: atualizado ? normalizarData(atualizado) : null,
    status,
    nameservers,
    proprietario: primeiroCampo(texto, "Owner Name", "Registrant Name", "Registrant"),
    organizacao: primeiroCampo(texto, "Owner Organization", "Registrant Organization", "Organization"),
  };
}

/**
 * Descobre o servidor WHOIS do TLD via IANA e consulta o domínio nele.
 * Retorna null quando não dá pra descobrir/consultar (chamador decide o
 * que fazer — normalmente cair num erro claro em vez de um "disponível"
 * chutado).
 */
export async function consultarWhois(dominio: string): Promise<WhoisResult | null> {
  const tld = dominio.split(".").pop();
  if (!tld) return null;

  const respostaIana = await whoisQuery("whois.iana.org", tld, 8_000);
  const servidor = respostaIana ? extrairServidorWhois(respostaIana) : null;
  if (!servidor) return null;

  const resposta = await whoisQuery(servidor, dominio, 9_000);
  // Resposta vazia e ambigua: pode ser dominio livre (alguns servidores
  // ficam mudos nesse caso, confirmado ao vivo), mas tambem pode ser o
  // servidor limitando taxa de consulta. Sem uma frase explicita de "nao
  // encontrado", melhor nao arriscar um "disponivel" errado.
  if (resposta === null || !resposta.trim()) return null;

  if (FRASES_NAO_ENCONTRADO.test(resposta)) {
    return { domain: dominio, disponivel: true };
  }
  return { domain: dominio, disponivel: false, ...parseWhoisGenerico(resposta) };
}
