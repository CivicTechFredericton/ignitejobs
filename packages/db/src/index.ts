import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.ts";

export * from "./schema.ts";
export { schema };

export function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new pg.Pool({ connectionString: url });
  // An idle connection dropping (e.g. the server restarting) emits "error" on the pool; without
  // a listener Node treats it as unhandled and exits. The pool replaces the client on its own.
  pool.on("error", (error) => console.error("database connection lost", error.message));
  return Object.assign(drizzle({ client: pool, schema }), { pool });
}

export type Db = ReturnType<typeof createDb>;
