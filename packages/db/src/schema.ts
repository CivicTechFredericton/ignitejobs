import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Text stored per locale, e.g. { en: "Government", fr: "Gouvernement" }. */
export type LocalizedText = Record<string, string>;

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

// Postgres 18 ships uuidv7(): time-ordered, index friendly.
const id = () => uuid("id").primaryKey().default(sql`uuidv7()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const localized = (name: string) => jsonb(name).$type<LocalizedText>().notNull();

export const sourceKind = pgEnum("source_kind", ["careers_page", "posting"]);
export const sourceStatus = pgEnum("source_status", ["active", "paused", "blocked", "manual_only"]);
export const scrapeStrategy = pgEnum("scrape_strategy", [
  "auto",
  "platform_api",
  "json_ld",
  "static_html",
  "headless",
  "manual",
]);
export const scrapeJobStatus = pgEnum("scrape_job_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "blocked",
]);
export const postingStatus = pgEnum("posting_status", ["pending", "approved", "rejected", "closed"]);
export const postingOrigin = pgEnum("posting_origin", ["scraped", "manual"]);

export const ROLES = ["moderator", "admin"] as const;
export type Role = (typeof ROLES)[number];

/**
 * People who have signed in through the identity provider (FerrisKey, over OIDC). The provider
 * handles identity; roles live here. A row is created (with no roles) when someone first signs
 * in; grant roles with `pnpm db:users grant`.
 */
export const users = pgTable(
  "users",
  {
    id: id(),
    /** The OIDC `sub` claim: the identity provider's stable id for this person. */
    idpSubject: text("idp_subject").notNull(),
    /** Refreshed from the ID token at every sign-in, so admins can tell people apart. */
    email: text("email"),
    name: text("name"),
    roles: text("roles").array().$type<Role[]>().notNull().default(sql`ARRAY[]::text[]`),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_idp_subject_idx").on(t.idpSubject),
    index("users_email_idx").on(sql`lower(${t.email})`),
    check("users_roles_valid", sql`${t.roles} <@ ARRAY['moderator', 'admin']::text[]`),
  ],
);

/**
 * Signed-in browser sessions. The cookie holds a random token; only its SHA-256 hash is stored,
 * so a database leak cannot be replayed as live sessions.
 */
export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Kept for RP-initiated logout (id_token_hint), so signing out also ends the IdP session. */
    idToken: text("id_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId), index("sessions_expires_at_idx").on(t.expiresAt)],
);

/** One row per deployment: which workforce body this instance serves. */
export const siteSettings = pgTable("site_settings", {
  id: integer("id").primaryKey().default(1),
  name: localized("name"),
  region: localized("region"),
  defaultLocale: text("default_locale").notNull().default("en"),
  locales: text("locales").array().notNull().default(sql`ARRAY['en','fr']`),
  branding: jsonb("branding").$type<{ logoUrl?: string; primaryColor?: string }>().notNull().default({}),
  updatedAt: updatedAt(),
});

export const locations = pgTable("locations", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: localized("name"),
  /** Lower-cased spellings seen in scraped text, used to normalise locations. */
  aliases: text("aliases").array().notNull().default(sql`ARRAY[]::text[]`),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const industries = pgTable("industries", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: localized("name"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const jobTypes = pgTable("job_types", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: localized("name"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const organizations = pgTable(
  "organizations",
  {
    id: id(),
    name: text("name").notNull(),
    /** De-duplication key computed by the normalize_org_name() SQL function (migration 0002). */
    normalizedName: text("normalized_name")
      .notNull()
      .generatedAlwaysAs(sql`normalize_org_name(name)`),
    website: text("website"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("organizations_normalized_name_idx").on(t.normalizedName)],
);

export const sources = pgTable(
  "sources",
  {
    id: id(),
    url: text("url").notNull(),
    domain: text("domain").notNull(),
    kind: sourceKind("kind").notNull(),
    /** Detected job platform, e.g. "bamboohr", "workday", "indeed", "linkedin", "generic". */
    platform: text("platform").notNull().default("generic"),
    strategy: scrapeStrategy("strategy").notNull().default("auto"),
    status: sourceStatus("status").notNull().default("active"),
    organizationId: uuid("organization_id").references(() => organizations.id),
    /** Per-source selectors or adapter options. */
    options: jsonb("options").$type<Record<string, unknown>>().notNull().default({}),
    lastScrapedAt: timestamp("last_scraped_at", { withTimezone: true }),
    addedBy: text("added_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("sources_url_idx").on(t.url), index("sources_domain_idx").on(t.domain)],
);

export const postings = pgTable(
  "postings",
  {
    id: id(),
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    organizationId: uuid("organization_id").references(() => organizations.id),
    title: text("title").notNull(),
    url: text("url").notNull(),
    locationId: uuid("location_id").references(() => locations.id),
    locationText: text("location_text"),
    industryId: uuid("industry_id").references(() => industries.id),
    jobTypeId: uuid("job_type_id").references(() => jobTypes.id),
    /** BCP 47 language of the posting content, e.g. "en" or "fr". */
    language: text("language"),
    description: text("description"),
    raw: jsonb("raw").$type<Record<string, unknown>>(),
    contentHash: text("content_hash"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    status: postingStatus("status").notNull().default("pending"),
    origin: postingOrigin("origin").notNull(),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNotes: text("review_notes"),
    search: tsvector("search").generatedAlwaysAs(
      sql`setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(location_text, '')), 'B') || setweight(to_tsvector('simple', coalesce(description, '')), 'C')`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("postings_url_idx").on(t.url),
    index("postings_status_idx").on(t.status),
    index("postings_search_idx").using("gin", t.search),
  ],
);

export const scrapeJobs = pgTable(
  "scrape_jobs",
  {
    id: id(),
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "cascade" }),
    postingId: uuid("posting_id").references(() => postings.id, { onDelete: "cascade" }),
    strategy: scrapeStrategy("strategy").notNull().default("auto"),
    /** Which worker pool may claim it: "http" or "browser". */
    pool: text("pool").notNull().default("http"),
    status: scrapeJobStatus("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    lastError: text("last_error"),
    result: jsonb("result").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("scrape_jobs_claim_idx")
      .on(t.pool, t.runAfter)
      .where(sql`status = 'queued'`),
  ],
);

export const editions = pgTable("editions", {
  id: id(),
  title: localized("title"),
  notes: jsonb("notes").$type<LocalizedText>(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  publishedBy: text("published_by").notNull(),
});

export const editionPostings = pgTable(
  "edition_postings",
  {
    editionId: uuid("edition_id")
      .notNull()
      .references(() => editions.id, { onDelete: "cascade" }),
    postingId: uuid("posting_id")
      .notNull()
      .references(() => postings.id),
    /** True when the posting was not in the previous edition. */
    isNew: boolean("is_new").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.editionId, t.postingId] })],
);
