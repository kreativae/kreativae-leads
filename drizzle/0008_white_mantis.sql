ALTER TABLE "leads" ADD COLUMN "automation_status" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "automation_channel" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "automation_at" timestamp with time zone;