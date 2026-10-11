CREATE TYPE "public"."posting_origin" AS ENUM('scraped', 'manual');--> statement-breakpoint
CREATE TYPE "public"."posting_status" AS ENUM('pending', 'approved', 'rejected', 'closed');--> statement-breakpoint
CREATE TYPE "public"."scrape_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."scrape_strategy" AS ENUM('auto', 'platform_api', 'json_ld', 'static_html', 'headless', 'manual');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('careers_page', 'posting');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('active', 'paused', 'blocked', 'manual_only');--> statement-breakpoint
CREATE TABLE "edition_postings" (
	"edition_id" uuid NOT NULL,
	"posting_id" uuid NOT NULL,
	"is_new" boolean DEFAULT false NOT NULL,
	CONSTRAINT "edition_postings_edition_id_posting_id_pk" PRIMARY KEY("edition_id","posting_id")
);
--> statement-breakpoint
CREATE TABLE "editions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"title" jsonb NOT NULL,
	"notes" jsonb,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "industries" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"name" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "industries_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "job_types" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"name" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "job_types_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"name" jsonb NOT NULL,
	"aliases" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "locations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"website" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "postings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"source_id" uuid,
	"organization_id" uuid,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"location_id" uuid,
	"location_text" text,
	"industry_id" uuid,
	"job_type_id" uuid,
	"language" text,
	"description" text,
	"raw" jsonb,
	"content_hash" text,
	"posted_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"status" "posting_status" DEFAULT 'pending' NOT NULL,
	"origin" "posting_origin" NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_notes" text,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(location_text, '')), 'B') || setweight(to_tsvector('simple', coalesce(description, '')), 'C')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scrape_jobs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"source_id" uuid,
	"posting_id" uuid,
	"strategy" "scrape_strategy" DEFAULT 'auto' NOT NULL,
	"pool" text DEFAULT 'http' NOT NULL,
	"status" "scrape_job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" jsonb NOT NULL,
	"region" jsonb NOT NULL,
	"default_locale" text DEFAULT 'en' NOT NULL,
	"locales" text[] DEFAULT ARRAY['en','fr'] NOT NULL,
	"branding" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"url" text NOT NULL,
	"domain" text NOT NULL,
	"kind" "source_kind" NOT NULL,
	"platform" text DEFAULT 'generic' NOT NULL,
	"strategy" "scrape_strategy" DEFAULT 'auto' NOT NULL,
	"status" "source_status" DEFAULT 'active' NOT NULL,
	"organization_id" uuid,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_scraped_at" timestamp with time zone,
	"added_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "edition_postings" ADD CONSTRAINT "edition_postings_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edition_postings" ADD CONSTRAINT "edition_postings_posting_id_postings_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."postings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_job_type_id_job_types_id_fk" FOREIGN KEY ("job_type_id") REFERENCES "public"."job_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_jobs" ADD CONSTRAINT "scrape_jobs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_jobs" ADD CONSTRAINT "scrape_jobs_posting_id_postings_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."postings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_normalized_name_idx" ON "organizations" USING btree ("normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "postings_url_idx" ON "postings" USING btree ("url");--> statement-breakpoint
CREATE INDEX "postings_status_idx" ON "postings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "postings_search_idx" ON "postings" USING gin ("search");--> statement-breakpoint
CREATE INDEX "scrape_jobs_claim_idx" ON "scrape_jobs" USING btree ("pool","run_after") WHERE status = 'queued';--> statement-breakpoint
CREATE UNIQUE INDEX "sources_url_idx" ON "sources" USING btree ("url");--> statement-breakpoint
CREATE INDEX "sources_domain_idx" ON "sources" USING btree ("domain");