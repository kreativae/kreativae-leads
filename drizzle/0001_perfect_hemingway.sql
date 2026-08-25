ALTER TABLE "leads" ADD COLUMN "ig_username" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ig_followers" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ig_media_count" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ig_biography" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ig_checked_at" timestamp with time zone;