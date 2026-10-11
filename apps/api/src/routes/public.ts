import { zValidator } from "@hono/zod-validator";
import {
  editionPostings,
  editions,
  industries,
  jobTypes,
  locations,
  organizations,
  postings,
  siteSettings,
} from "@ignite/db";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db.ts";

export const postingColumns = {
  id: postings.id,
  title: postings.title,
  url: postings.url,
  organization: organizations.name,
  locationText: postings.locationText,
  location: { slug: locations.slug, name: locations.name },
  industry: { slug: industries.slug, name: industries.name },
  jobType: { slug: jobTypes.slug, name: jobTypes.name },
  language: postings.language,
  postedAt: postings.postedAt,
  closesAt: postings.closesAt,
};

const searchQuery = z.object({
  q: z.string().trim().max(200).optional(),
  industry: z.string().optional(),
  jobType: z.string().optional(),
  location: z.string().optional(),
});

async function resolveEdition(id: string) {
  const query = db.select().from(editions);
  const [edition] =
    id === "latest"
      ? await query.orderBy(desc(editions.publishedAt)).limit(1)
      : await query.where(eq(editions.id, id)).limit(1);
  return edition;
}

export const publicRoutes = new Hono()
  .get("/site", async (c) => {
    const [site] = await db.select().from(siteSettings).limit(1);
    return site ? c.json(site) : c.json({ error: "site_not_configured" }, 500);
  })
  .get("/taxonomies", async (c) => {
    const term = { slug: true, name: true } as const;
    const [inds, types, locs] = await Promise.all([
      db.query.industries.findMany({ columns: term, where: eq(industries.active, true), orderBy: asc(industries.sortOrder) }),
      db.query.jobTypes.findMany({ columns: term, where: eq(jobTypes.active, true), orderBy: asc(jobTypes.sortOrder) }),
      db.query.locations.findMany({ columns: term, where: eq(locations.active, true), orderBy: asc(locations.sortOrder) }),
    ]);
    return c.json({ industries: inds, jobTypes: types, locations: locs });
  })
  .get("/editions", async (c) => {
    const rows = await db
      .select({ id: editions.id, title: editions.title, publishedAt: editions.publishedAt })
      .from(editions)
      .orderBy(desc(editions.publishedAt));
    return c.json(rows);
  })
  .get("/editions/:id/postings", zValidator("query", searchQuery), async (c) => {
    const edition = await resolveEdition(c.req.param("id"));
    if (!edition) return c.json({ error: "edition_not_found" }, 404);
    const { q, industry, jobType, location } = c.req.valid("query");

    const filters: (SQL | undefined)[] = [
      eq(editionPostings.editionId, edition.id),
      q ? sql`${postings.search} @@ websearch_to_tsquery('simple', ${q})` : undefined,
      industry ? eq(industries.slug, industry) : undefined,
      jobType ? eq(jobTypes.slug, jobType) : undefined,
      location ? eq(locations.slug, location) : undefined,
    ];
    const rows = await db
      .select({ ...postingColumns, isNew: editionPostings.isNew })
      .from(editionPostings)
      .innerJoin(postings, eq(postings.id, editionPostings.postingId))
      .leftJoin(organizations, eq(organizations.id, postings.organizationId))
      .leftJoin(locations, eq(locations.id, postings.locationId))
      .leftJoin(industries, eq(industries.id, postings.industryId))
      .leftJoin(jobTypes, eq(jobTypes.id, postings.jobTypeId))
      .where(and(...filters))
      .orderBy(
        q ? desc(sql`ts_rank(${postings.search}, websearch_to_tsquery('simple', ${q}))`) : asc(industries.sortOrder),
        asc(postings.title),
      );
    return c.json({ edition, postings: rows });
  });
