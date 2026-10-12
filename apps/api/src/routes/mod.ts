import { validate } from "../validate.ts";
import {
  editionPostings,
  editions,
  industries,
  jobTypes,
  locations,
  organizations,
  postings,
  scrapeJobs,
  sources,
} from "@ignite/db";
import { and, count, desc, eq, inArray, notExists, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { type AuthVariables, authenticate, requireModerator } from "../auth.ts";
import { db } from "../db.ts";
import { postingColumns } from "./public.ts";

const localized = z.record(z.string(), z.string().trim().min(1));
const postingStatus = z.enum(["pending", "approved", "rejected", "closed"]);

const newSource = z.object({
  url: z.url({ protocol: /^https?$/ }),
  kind: z.enum(["careers_page", "posting"]),
});

const postingFields = z.object({
  title: z.string().trim().min(1).max(300),
  url: z.url({ protocol: /^https?$/ }),
  organization: z.string().trim().min(1).max(200),
  locationText: z.string().trim().max(200).optional(),
  locationId: z.uuid().nullable().optional(),
  industryId: z.uuid().nullable().optional(),
  jobTypeId: z.uuid().nullable().optional(),
  language: z.string().max(10).optional(),
  closesAt: z.coerce.date().nullable().optional(),
});

const review = postingFields.partial().extend({
  status: postingStatus.optional(),
  reviewNotes: z.string().max(2000).optional(),
});

/** Find or create an organization; normalize_org_name() in Postgres merges spelling variants. */
async function organizationId(name: string) {
  const [org] = await db
    .insert(organizations)
    .values({ name })
    .onConflictDoUpdate({ target: organizations.normalizedName, set: { name: sql`organizations.name` } })
    .returning({ id: organizations.id });
  return org!.id;
}

/** Postings that a new edition would contain. */
const publishable = eq(postings.status, "approved");

async function latestEditionId() {
  const [latest] = await db
    .select({ id: editions.id })
    .from(editions)
    .orderBy(desc(editions.publishedAt))
    .limit(1);
  return latest?.id ?? null;
}

const lastJob = db
  .select({
    sourceId: scrapeJobs.sourceId,
    status: scrapeJobs.status,
    lastError: scrapeJobs.lastError,
    finishedAt: scrapeJobs.finishedAt,
  })
  .from(scrapeJobs)
  .where(sql`${scrapeJobs.sourceId} = ${sources.id}`)
  .orderBy(desc(scrapeJobs.createdAt))
  .limit(1)
  .as("last_job");

export const modRoutes = new Hono<{ Variables: AuthVariables }>()
  .use(authenticate, requireModerator)
  .get("/me", (c) => c.json({ userId: c.get("userId"), roles: c.get("user").roles }))

  .get("/summary", async (c) => {
    const [[pending], [troubled]] = await Promise.all([
      db.select({ n: count() }).from(postings).where(eq(postings.status, "pending")),
      db.select({ n: count() }).from(sources).where(inArray(sources.status, ["blocked", "manual_only"])),
    ]);
    return c.json({ pendingPostings: pending!.n, blockedSources: troubled!.n });
  })

  .get("/sources", async (c) => {
    const rows = await db
      .select({
        id: sources.id,
        url: sources.url,
        domain: sources.domain,
        kind: sources.kind,
        platform: sources.platform,
        status: sources.status,
        lastScrapedAt: sources.lastScrapedAt,
        createdAt: sources.createdAt,
        lastJob: { status: lastJob.status, lastError: lastJob.lastError, finishedAt: lastJob.finishedAt },
        postingCount: sql<number>`(SELECT count(*)::int FROM ${postings} WHERE ${postings.sourceId} = ${sources.id})`,
      })
      .from(sources)
      .leftJoinLateral(lastJob, sql`true`)
      .orderBy(desc(sources.createdAt));
    return c.json(rows);
  })
  .post("/sources", validate("json", newSource), async (c) => {
    const { url, kind } = c.req.valid("json");
    const domain = new URL(url).hostname.replace(/^www\./, "");
    const source = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(sources)
        .values({ url, kind, domain, addedBy: c.get("userId") })
        .onConflictDoNothing()
        .returning();
      // The worker detects the platform and reroutes to the browser pool when needed.
      if (row) await tx.insert(scrapeJobs).values({ sourceId: row.id });
      return row;
    });
    return source ? c.json(source, 201) : c.json({ error: "source_exists" }, 409);
  })
  .post("/sources/:id/scrape", async (c) => {
    const id = c.req.param("id");
    const job = await db.transaction(async (tx) => {
      // A moderator retry lifts a previous block; LinkedIn stays blocked because the worker re-blocks it.
      const [source] = await tx
        .update(sources)
        .set({ status: "active" })
        .where(eq(sources.id, id))
        .returning({ id: sources.id });
      if (!source) return null;
      const [row] = await tx.insert(scrapeJobs).values({ sourceId: id }).returning();
      return row;
    });
    return job ? c.json(job, 201) : c.json({ error: "source_not_found" }, 404);
  })

  .get("/postings", validate("query", z.object({ status: postingStatus.optional() })), async (c) => {
    const { status = "pending" } = c.req.valid("query");
    const rows = await db
      .select({
        ...postingColumns,
        status: postings.status,
        origin: postings.origin,
        industryId: postings.industryId,
        jobTypeId: postings.jobTypeId,
        locationId: postings.locationId,
        reviewNotes: postings.reviewNotes,
        sourceUrl: sources.url,
        createdAt: postings.createdAt,
      })
      .from(postings)
      .leftJoin(organizations, eq(organizations.id, postings.organizationId))
      .leftJoin(locations, eq(locations.id, postings.locationId))
      .leftJoin(industries, eq(industries.id, postings.industryId))
      .leftJoin(jobTypes, eq(jobTypes.id, postings.jobTypeId))
      .leftJoin(sources, eq(sources.id, postings.sourceId))
      .where(eq(postings.status, status))
      .orderBy(desc(postings.createdAt));
    return c.json(rows);
  })
  .post("/postings", validate("json", postingFields), async (c) => {
    const { organization, ...fields } = c.req.valid("json");
    const [row] = await db
      .insert(postings)
      .values({
        ...fields,
        locationId: fields.locationId ?? (fields.locationText ? sql`match_location(${fields.locationText})` : null),
        organizationId: await organizationId(organization),
        origin: "manual",
        status: "approved",
        reviewedBy: c.get("userId"),
        reviewedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();
    return row ? c.json(row, 201) : c.json({ error: "posting_exists" }, 409);
  })
  .patch("/postings/:id", validate("json", review), async (c) => {
    const { organization, ...fields } = c.req.valid("json");
    const [row] = await db
      .update(postings)
      .set({
        ...fields,
        ...(organization ? { organizationId: await organizationId(organization) } : {}),
        ...(fields.status ? { reviewedBy: c.get("userId"), reviewedAt: new Date() } : {}),
      })
      .where(eq(postings.id, c.req.param("id")))
      .returning();
    return row ? c.json(row) : c.json({ error: "posting_not_found" }, 404);
  })

  .get("/editions/preview", async (c) => {
    const previousId = await latestEditionId();
    const inPrevious = (postingId: typeof postings.id) =>
      db
        .select({ one: sql`1` })
        .from(editionPostings)
        .where(and(eq(editionPostings.editionId, previousId ?? sql`NULL`), eq(editionPostings.postingId, postingId)));
    const summary = { id: postings.id, title: postings.title, organization: organizations.name };

    const [added, removed, [kept]] = await Promise.all([
      db
        .select(summary)
        .from(postings)
        .leftJoin(organizations, eq(organizations.id, postings.organizationId))
        .where(and(publishable, notExists(inPrevious(postings.id))))
        .orderBy(postings.title),
      previousId
        ? db
            .select({ ...summary, status: postings.status })
            .from(editionPostings)
            .innerJoin(postings, eq(postings.id, editionPostings.postingId))
            .leftJoin(organizations, eq(organizations.id, postings.organizationId))
            .where(and(eq(editionPostings.editionId, previousId), sql`${postings.status} <> 'approved'`))
            .orderBy(postings.title)
        : Promise.resolve([]),
      db.select({ n: count() }).from(postings).where(publishable),
    ]);
    return c.json({ previousEditionId: previousId, added, removed, total: kept!.n });
  })
  .post("/editions", validate("json", z.object({ title: localized, notes: localized.optional() })), async (c) => {
    const { title, notes } = c.req.valid("json");
    const edition = await db.transaction(async (tx) => {
      const [previous] = await tx
        .select({ id: editions.id })
        .from(editions)
        .orderBy(desc(editions.publishedAt))
        .limit(1);
      const [created] = await tx
        .insert(editions)
        .values({ title, notes, publishedBy: c.get("userId") })
        .returning();
      // Snapshot every approved posting; "new" means it was not in the previous edition.
      await tx.execute(sql`
        INSERT INTO ${editionPostings} (edition_id, posting_id, is_new)
        SELECT ${created!.id}, p.id, NOT EXISTS (
          SELECT 1 FROM ${editionPostings} prev
          WHERE prev.edition_id = ${previous?.id ?? null} AND prev.posting_id = p.id)
        FROM ${postings} p WHERE p.status = 'approved'`);
      return created!;
    });
    return c.json(edition, 201);
  });
