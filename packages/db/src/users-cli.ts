// Manage moderator roles.
//   pnpm db:users list
//   pnpm db:users grant <email | clerk_user_id> <moderator|admin>
//   pnpm db:users revoke <email | clerk_user_id> <moderator|admin>
// People appear in the list after they first sign in. Granting by Clerk user id (user_...)
// also works before that.
import { asc, eq, sql } from "drizzle-orm";
import { ROLES, type Role, createDb, users } from "./index.ts";

const [command, who, roleArg] = process.argv.slice(2);
const db = createDb();

function usage(): never {
  console.error("usage: pnpm db:users list | grant <email|clerk_user_id> <role> | revoke <email|clerk_user_id> <role>");
  console.error(`roles: ${ROLES.join(", ")}`);
  process.exit(1);
}

const isRole = (value: string | undefined): value is Role => ROLES.includes(value as Role);
const byWho = (value: string) =>
  value.startsWith("user_") ? eq(users.clerkUserId, value) : sql`lower(${users.email}) = lower(${value})`;

try {
  if (command === "list") {
    const rows = await db
      .select({ email: users.email, name: users.name, clerkUserId: users.clerkUserId, roles: users.roles, lastSeenAt: users.lastSeenAt })
      .from(users)
      .orderBy(asc(users.email));
    console.table(rows.map((r) => ({ ...r, roles: r.roles.join(", ") || "-" })));
  } else if ((command === "grant" || command === "revoke") && who && isRole(roleArg)) {
    const roles =
      command === "grant"
        ? sql`(SELECT array_agg(DISTINCT r ORDER BY r) FROM unnest(array_append(${users.roles}, ${roleArg})) r)`
        : sql`array_remove(${users.roles}, ${roleArg})`;
    let [row] = await db.update(users).set({ roles }).where(byWho(who)).returning();
    if (!row && command === "grant" && who.startsWith("user_")) {
      [row] = await db.insert(users).values({ clerkUserId: who, roles: [roleArg] }).returning();
    }
    if (!row) {
      console.error(`No user matches ${who}. They need to sign in once first, or use their Clerk user id.`);
      process.exitCode = 1;
    } else {
      console.log(`${row.email ?? row.clerkUserId}: ${row.roles.join(", ") || "(no roles)"}`);
    }
  } else {
    usage();
  }
} finally {
  await db.pool.end();
}
