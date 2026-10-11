import { zValidator } from "@hono/zod-validator";
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
import { desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { type AuthVariables, authenticate, requireModerator } from "../auth.ts";
import { db } from "../db.ts";
import { postingColumns } from "./public.ts";

const localized = z.record(z.string(), z.string().trim().min(1));

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
  status: z.enum(["pending", "approved", "rejected", "closed"]).optional(),
  reviewNotes: z.string().max(2000).optional(),
});

const normalizeOrg = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

async function organizationId(name: string) {
  const [org] = await db
    .insert(organizations)
    .values({ name, normalizedName: normalizeOrg(name) })
    .onConflictDoUpdate({ target: organizations.normalizedName, set: { name: sql`organizations.name` } })
    .returning({ id: organizations.id });
  return org!.id;
}

export const modRoutes = new Hono<{ Variables: AuthVariables }>()
  .use(authenticate, requireModerator)
  .get("/me", (c) => c.json({ userId: c.get("userId"), role: c.get("role") }))

  .get("/sources", async (c) => c.json(await db.select().from(sources).orderBy(desc(sources.createdAt))))
  .post("/sources", zValidator("json", newSource), async (c) => {
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
    const [job] = await db.insert(scrapeJobs).values({ sourceId: c.req.param("id") }).returning();
    return c.json(job, 201);
  })

  .get("/postings", zValidator("query", z.object({ status: review.shape.status })), async (c) => {
    const { status = "pending" } = c.req.valid("query");
    const rows = await db
      .select({
        ...postingColumns,
        status: postings.status,
        origin: postings.origin,
        industryId: postings.industryId,
        jobTypeId: postings.jobTypeId,
        locationId: postings.locationId,
        createdAt: postings.createdAt,
      })
      .from(postings)
      .leftJoin(organizations, eq(organizations.id, postings.organizationId))
      .leftJoin(locations, eq(locations.id, postings.locationId))
      .leftJoin(industries, eq(industries.id, postings.industryId))
      .leftJoin(jobTypes, eq(jobTypes.id, postings.jobTypeId))
      .where(eq(postings.status, status))
      .orderBy(desc(postings.createdAt));
    return c.json(rows);
  })
  .post("/postings", zValidator("json", postingFields), async (c) => {
    const { organization, ...fields } = c.req.valid("json");
    const [row] = await db
      .insert(postings)
      .values({
        ...fields,
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
  .patch("/postings/:id", zValidator("json", review), async (c) => {
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

  .post("/editions", zValidator("json", z.object({ title: localized, notes: localized.optional() })), async (c) => {
    const { title, notes } = c.req.valid("json");
    const edition = await db.transaction(async (tx) => {
      const [previous] = await tx.select({ id: editions.id }).from(editions).orderBy(desc(editions.publishedAt)).limit(1);
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
