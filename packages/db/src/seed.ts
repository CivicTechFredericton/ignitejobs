import { sql } from "drizzle-orm";
import { createDb, industries, jobTypes, locations, siteSettings } from "./index.ts";
import * as data from "./seed/fredericton.ts";

const db = createDb();
const upsertName = { set: { name: sql`excluded.name`, sortOrder: sql`excluded.sort_order` } };
const ordered = <T>(rows: T[]) => rows.map((row, sortOrder) => ({ ...row, sortOrder }));

await db.transaction(async (tx) => {
  await tx
    .insert(siteSettings)
    .values({ id: 1, ...data.site })
    .onConflictDoUpdate({ target: siteSettings.id, set: data.site });
  await tx
    .insert(locations)
    .values(ordered(data.locations))
    .onConflictDoUpdate({ target: locations.slug, ...upsertName });
  await tx
    .insert(industries)
    .values(ordered(data.industries))
    .onConflictDoUpdate({ target: industries.slug, ...upsertName });
  await tx
    .insert(jobTypes)
    .values(ordered(data.jobTypes))
    .onConflictDoUpdate({ target: jobTypes.slug, ...upsertName });
});

console.log("Seeded site settings and taxonomies");
await db.pool.end();
