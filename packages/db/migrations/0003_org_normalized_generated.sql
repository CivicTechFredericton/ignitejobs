ALTER TABLE "organizations" drop column "normalized_name";--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "normalized_name" text GENERATED ALWAYS AS (normalize_org_name(name)) STORED NOT NULL;--> statement-breakpoint
-- Dropping the column dropped its unique index; recreate it.
CREATE UNIQUE INDEX "organizations_normalized_name_idx" ON "organizations" USING btree ("normalized_name");
