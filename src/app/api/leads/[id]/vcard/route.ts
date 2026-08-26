import { NextResponse } from "next/server";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildVCard, vcardFilename } from "@/lib/vcard";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Entrega o contato como arquivo. Servir pelo servidor com o Content-Type
 * certo e o que faz o iOS oferecer "Adicionar aos contactos" — um blob
 * gerado no navegador costuma acabar exibido como texto puro no iPhone.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!lead)
    return NextResponse.json({ ok: false, error: "Lead não encontrado." }, { status: 404 });

  return new Response(buildVCard(lead), {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
        vcardFilename(lead.companyName),
      )}`,
      "Cache-Control": "no-store",
    },
  });
}
