/**
 * Copia texto e HTML de uma vez. Quem recebe escolhe: editor de e-mail pega o
 * HTML e mostra os numeros clicaveis; WhatsApp e campo simples pegam o texto,
 * onde o endereco wa.me continua a vista para nao se perder o link.
 */
export async function copiarRico(texto: string, html: string): Promise<void> {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([texto], { type: "text/plain" }),
        }),
      ]);
      return;
    }
  } catch {
    // Permissao negada, navegador sem ClipboardItem, pagina sem TLS: cai no
    // texto puro, que e o que sempre funcionou.
  }
  await navigator.clipboard.writeText(texto);
}
