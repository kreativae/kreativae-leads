import { NextResponse } from "next/server";
import { inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getEffectiveSetting } from "@/lib/settings-db";
import { buscarNoGoogle } from "@/lib/serper";
import { registrarConsultasSerper } from "@/lib/serper-cost";
import { extrairCandidato } from "@/lib/dork-extract";

export const dynamic = "force-dynamic";

/** Até 10 páginas (100 resultados) por comando — o Google raramente tem mais que isso útil. */
const PAGINA_MAXIMA = 10;

/**
 * Roda um comando da aba Comandos no Google e devolve os resultados como
 * candidatos a lead. Não grava lead nenhum — adicionar é outro passo
 * (POST /api/search/manual com source "comandos").
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  let body: { q?: unknown; pagina?: unknown; cidade?: unknown; categoria?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const q = typeof body.q === "string" ? body.q.trim() : "";
  if (q.length < 3 || q.length > 2000)
    return NextResponse.json({ ok: false, error: "Comando vazio ou longo demais." }, { status: 400 });
  const pagina = Math.min(PAGINA_MAXIMA, Math.max(1, Number(body.pagina) || 1));
  const cidade = typeof body.cidade === "string" ? body.cidade.trim().slice(0, 100) || null : null;
  const categoria =
    typeof body.categoria === "string" ? body.categoria.trim().slice(0, 100) || null : null;

  const apiKey = await getEffectiveSetting("serper_api_key", "SERPER_API_KEY");
  if (!apiKey)
    return NextResponse.json(
      {
        ok: false,
        error: "Rodar a busca aqui precisa da chave do Serper — adicione em Configurações.",
      },
      { status: 400 },
    );

  const r = await buscarNoGoogle({ q, pagina, apiKey });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  await registrarConsultasSerper(1);

  const candidatos = r.resultados.map((res) => extrairCandidato(res, { city: cidade, categoria }));

  // Marca o que já é lead: mesmo osmId (mesmo perfil/página) ou mesmo e-mail.
  const ids = candidatos.map((c) => c.osmId);
  const emails = candidatos.map((c) => c.email).filter((e): e is string => !!e);
  if (ids.length) {
    const existentes = await db
      .select({ id: leads.id, osmId: leads.osmId, email: leads.email })
      .from(leads)
      .where(
        emails.length
          ? or(inArray(leads.osmId, ids), inArray(leads.email, emails))
          : inArray(leads.osmId, ids),
      );
    for (const c of candidatos) {
      const achou = existentes.find(
        (e) => e.osmId === c.osmId || (!!c.email && e.email?.toLowerCase() === c.email),
      );
      if (achou) c.existingLeadId = achou.id;
    }
  }

  return NextResponse.json({
    ok: true,
    pagina,
    temMais: r.resultados.length >= 10 && pagina < PAGINA_MAXIMA,
    candidatos,
  });
}
