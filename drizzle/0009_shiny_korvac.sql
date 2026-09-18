CREATE TABLE "buscador_historico" (
	"chave" text PRIMARY KEY NOT NULL,
	"modo" text NOT NULL,
	"query" text NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"country" text DEFAULT 'BR' NOT NULL,
	"candidatos" jsonb NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
