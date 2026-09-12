ALTER TABLE "messages" ADD COLUMN "type" text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "media_url" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "mime_type" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "file_name" text;