CREATE TABLE "wa_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"phone_number_id" text NOT NULL,
	"waba_id" text,
	"access_token" text NOT NULL,
	"display_phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "conversations_contact_phone_key";--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "wa_account_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "wa_accounts_phone_number_id_key" ON "wa_accounts" USING btree ("phone_number_id");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_wa_account_id_wa_accounts_id_fk" FOREIGN KEY ("wa_account_id") REFERENCES "public"."wa_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_contact_phone_account_key" ON "conversations" USING btree ("contact_phone","wa_account_id");