CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"event" text NOT NULL,
	"ip" text,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_phone" text NOT NULL,
	"contact_name" text,
	"lead_id" uuid,
	"last_message_at" timestamp with time zone,
	"last_message_preview" text,
	"last_inbound_at" timestamp with time zone,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_id" uuid,
	"osm_id" text NOT NULL,
	"company_name" text NOT NULL,
	"owner_name" text,
	"segment" text NOT NULL,
	"city" text,
	"state" text,
	"country" text DEFAULT 'BR' NOT NULL,
	"address" text,
	"neighborhood" text,
	"postcode" text,
	"lat" double precision,
	"lon" double precision,
	"phone" text,
	"phone_alt" text,
	"whatsapp" text,
	"email" text,
	"website" text,
	"instagram" text,
	"facebook" text,
	"linkedin" text,
	"opening_hours" text,
	"rating" double precision,
	"reviews_count" integer,
	"price_level" text,
	"google_maps_uri" text,
	"category_raw" text,
	"extra" jsonb,
	"contact_score" integer DEFAULT 0 NOT NULL,
	"enriched_at" timestamp with time zone,
	"website_score" integer,
	"website_grade" text,
	"website_checks" jsonb,
	"analyzed_at" timestamp with time zone,
	"opportunity" text DEFAULT 'unreviewed' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"body" text NOT NULL,
	"wa_message_id" text,
	"status" text DEFAULT 'sent' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"segment" text NOT NULL,
	"city" text NOT NULL,
	"state" text,
	"country" text DEFAULT 'BR' NOT NULL,
	"source" text DEFAULT 'osm' NOT NULL,
	"mode" text DEFAULT 'city' NOT NULL,
	"lat" double precision,
	"lon" double precision,
	"radius_km" double precision,
	"status" text DEFAULT 'running' NOT NULL,
	"results_count" integer DEFAULT 0 NOT NULL,
	"new_count" integer DEFAULT 0 NOT NULL,
	"with_phone_count" integer DEFAULT 0 NOT NULL,
	"with_whatsapp_count" integer DEFAULT 0 NOT NULL,
	"no_website_count" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"user_agent" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "totp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"totp_secret" text,
	"totp_enabled" text DEFAULT 'no' NOT NULL,
	"must_change_password" text DEFAULT 'no' NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "totp_challenges" ADD CONSTRAINT "totp_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_contact_phone_key" ON "conversations" USING btree ("contact_phone");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_osm_id_key" ON "leads" USING btree ("osm_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_wa_message_id_key" ON "messages" USING btree ("wa_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");