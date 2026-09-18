CREATE TABLE "ia_fila" (
	"id" uuid PRIMARY KEY NOT NULL,
	"image_url" text DEFAULT '' NOT NULL,
	"status" text NOT NULL,
	"candidato" jsonb,
	"edicao" jsonb,
	"erro" text,
	"lead_adicionado_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
