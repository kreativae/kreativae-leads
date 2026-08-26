interface VCardLead {
  companyName: string;
  ownerName: string | null;
  segment: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string;
  instagram: string | null;
}

/** Escapa os separadores do formato: barra, ponto e virgula, virgula e quebra. */
function esc(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function tel(raw: string): string {
  const d = raw.replace(/[^\d+]/g, "");
  return d.startsWith("+") ? d : `+${d}`;
}

/**
 * vCard 3.0 — o formato que iOS e macOS abrem oferecendo "Adicionar aos
 * contactos". Usa CRLF porque a especificacao exige.
 */
export function buildVCard(lead: VCardLead): string {
  const nome = esc(lead.companyName);
  const linhas = ["BEGIN:VCARD", "VERSION:3.0", `N:;${nome};;;`, `FN:${nome}`, `ORG:${nome}`];

  if (lead.segment) linhas.push(`TITLE:${esc(lead.segment)}`);
  // O WhatsApp entra como celular para o iPhone oferecer a acao certa.
  if (lead.whatsapp) linhas.push(`TEL;TYPE=CELL:${tel(lead.whatsapp)}`);
  if (lead.phone && tel(lead.phone) !== tel(lead.whatsapp ?? ""))
    linhas.push(`TEL;TYPE=WORK,VOICE:${tel(lead.phone)}`);
  if (lead.email) linhas.push(`EMAIL;TYPE=INTERNET:${esc(lead.email)}`);
  if (lead.website) linhas.push(`URL:${esc(lead.website)}`);
  if (lead.instagram) linhas.push(`URL;TYPE=Instagram:${esc(lead.instagram)}`);

  if (lead.address || lead.city) {
    const pais = lead.country === "PT" ? "Portugal" : "Brasil";
    linhas.push(
      `ADR;TYPE=WORK:;;${esc(lead.address ?? "")};${esc(lead.city ?? "")};${esc(
        lead.state ?? "",
      )};${esc(lead.postcode ?? "")};${pais}`,
    );
  }

  const notas = [
    lead.ownerName ? `Responsável: ${lead.ownerName}` : null,
    `Lead capturado pelo Radar kreativ.ae`,
  ]
    .filter(Boolean)
    .join("\n");
  linhas.push(`NOTE:${esc(notas)}`);
  linhas.push("END:VCARD");

  return linhas.join("\r\n");
}

/** Nome de arquivo seguro, preservando acentos. */
export function vcardFilename(companyName: string): string {
  const limpo = companyName.replace(/[^\p{L}\p{N} .-]/gu, "").trim();
  return `${limpo || "contato"}.vcf`;
}
