import { NextResponse } from "next/server";
import { db } from "@/db";
import { leads, searches } from "@/db/schema";
import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { LEAD_STATUSES } from "@/lib/constants";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Teto por coluna: um quadro com milhares de cartoes trava o navegador. */
const POR_COLUNA = 60;

/** searches.city guarda o rotulo da regiao; leads.city guarda so a cidade. */
function cidadeDe(rotulo: string): string {
  return rotulo.split(/[,·]/)[0].trim();
}

/**
 * Quadro do CRM. O filtro e por PESQUISA REALIZADA, agrupando as rodadas da
 * mesma busca: "Arquitetos · Porto" rodada 1 tem 0 leads vinculados porque a
 * rodada 2 os revinculou, entao listar rodada a rodada mostraria pesquisas
 * vazias. Leads orfaos (pesquisa apagada so desvincula) sao recuperados por
 * segmento + cidade.
 */
export async function GET(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const sp = new URL(req.url).searchParams;
  const incluirNovos = sp.get("novos") === "1";
  const pesquisa = sp.get("pesquisa") ?? "";
  // Uma letra so casaria com quase tudo; nao vale a viagem ao banco.
  const termo = (sp.get("q") ?? "").trim();
  const buscando = termo.length >= 2;

  const historico = await db
    .select({
      id: searches.id,
      segment: searches.segment,
      city: searches.city,
      country: searches.country,
      createdAt: searches.createdAt,
      resultsCount: searches.resultsCount,
    })
    .from(searches)
    .orderBy(desc(searches.createdAt));

  // Agrupa as rodadas: a chave e o que o usuario chama de "uma pesquisa".
  const porChave = new Map<
    string,
    {
      chave: string;
      segment: string;
      city: string;
      country: string;
      lastAt: Date;
      rounds: number;
      ids: string[];
    }
  >();
  for (const s of historico) {
    const cidade = cidadeDe(s.city);
    const chave = `${s.segment}|${cidade}`;
    const atual = porChave.get(chave);
    if (atual) {
      atual.ids.push(s.id);
      atual.rounds += 1;
      if (s.createdAt > atual.lastAt) atual.lastAt = s.createdAt;
    } else {
      porChave.set(chave, {
        chave,
        segment: s.segment,
        city: cidade,
        country: s.country,
        lastAt: s.createdAt,
        rounds: 1,
        ids: [s.id],
      });
    }
  }
  const grupos = [...porChave.values()].sort(
    (a, b) => b.lastAt.getTime() - a.lastAt.getTime(),
  );

  // Busca livre: nome da empresa, do contato, e-mail, site e telefones.
  // % e _ sao curingas do LIKE; escapo para que "50%" procure "50%" mesmo.
  const busca: SQL | undefined = (() => {
    if (!buscando) return undefined;
    const like = `%${termo.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const campos: SQL[] = [
      ilike(leads.companyName, like),
      ilike(leads.ownerName, like),
      ilike(leads.email, like),
      ilike(leads.website, like),
      ilike(leads.instagram, like),
    ];
    // Telefone digitado com mascara ("(11) 98765-4321") tem de achar o que
    // esta gravado cru ("5511987654321"): comparo so os digitos dos dois lados.
    const digitos = termo.replace(/[^0-9]/g, "");
    if (digitos.length >= 4) {
      const alvoNum = `%${digitos}%`;
      for (const col of [leads.phone, leads.phoneAlt, leads.whatsapp]) {
        campos.push(
          sql`regexp_replace(coalesce(${col}, ''), '[^0-9]', '', 'g') LIKE ${alvoNum}`,
        );
      }
    }
    return or(...campos) as SQL;
  })();

  const alvo = pesquisa && !buscando ? porChave.get(pesquisa) : undefined;
  const escopo: SQL | undefined = alvo
    ? (or(
        inArray(leads.searchId, alvo.ids),
        // Orfaos: a pesquisa que os trouxe foi apagada, mas eles continuam
        // sendo daquela busca. Sem isto, Advogados · Curitiba viria vazia.
        and(
          isNull(leads.searchId),
          eq(leads.segment, alvo.segment),
          eq(leads.city, alvo.city),
        ),
      ) as SQL)
    : undefined;

  // Procurar e "achar o lead": nao faz sentido a busca respeitar o filtro de
  // pesquisa nem a coluna Novos escondida. A tela avisa que ela e global.
  const restricao = busca ?? escopo;

  const filtro = (chave: string) =>
    restricao ? and(eq(leads.status, chave), restricao) : eq(leads.status, chave);

  const chaves = LEAD_STATUSES.map((s) => s.key).filter(
    (k) => incluirNovos || buscando || k !== "new",
  );

  const colunas = await Promise.all(
    chaves.map(async (chave) => {
      const [cards, totalRows] = await Promise.all([
        db
          .select()
          .from(leads)
          .where(filtro(chave))
          .orderBy(desc(leads.contactScore), desc(leads.createdAt))
          .limit(POR_COLUNA),
        db.select({ value: count() }).from(leads).where(filtro(chave)),
      ]);
      return { status: chave, total: totalRows[0]?.value ?? 0, leads: cards };
    }),
  );

  // O total de "novos" e util no cabecalho mesmo com a coluna oculta.
  const [novos] = await db
    .select({ value: count() })
    .from(leads)
    .where(filtro("new"));

  // Quantos leads cada pesquisa realmente tem hoje, para mostrar na lista.
  const contagens = await Promise.all(
    grupos.map(async (g) => {
      const [row] = await db
        .select({ value: count() })
        .from(leads)
        .where(
          or(
            inArray(leads.searchId, g.ids),
            and(
              isNull(leads.searchId),
              eq(leads.segment, g.segment),
              eq(leads.city, g.city),
            ),
          ),
        );
      return row?.value ?? 0;
    }),
  );

  return NextResponse.json({
    columns: colunas,
    searching: buscando,
    newTotal: novos?.value ?? 0,
    groups: grupos.map((g, i) => ({
      key: g.chave,
      segment: g.segment,
      city: g.city,
      country: g.country,
      lastAt: g.lastAt,
      rounds: g.rounds,
      total: contagens[i],
    })),
  });
}
