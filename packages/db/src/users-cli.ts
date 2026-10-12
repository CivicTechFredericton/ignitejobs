// Manage moderator roles.
//   pnpm db:users list
//   pnpm db:users grant <email | idp_subject> <moderator|admin>
//   pnpm db:users revoke <email | idp_subject> <moderator|admin>
// People appear in the list after they first sign in. Granting by their identity-provider id
// (the FerrisKey user id, shown in its admin console) also works before that.
import { asc, eq, sql } from "drizzle-orm";
import { ROLES, type Role, createDb, users } from "./index.ts";

const [command, who, roleArg] = process.argv.slice(2);
const db = createDb();

function usage(): never {
  console.error("usage: pnpm db:users list | grant <email|idp_subject> <role> | revoke <email|idp_subject> <role>");
  console.error(`roles: ${ROLES.join(", ")}`);
  process.exit(1);
}

const isRole = (value: string | undefined): value is Role => ROLES.includes(value as Role);
const byWho = (value: string) =>
  !value.includes("@") ? eq(users.idpSubject, value) : sql`lower(${users.email}) = lower(${value})`;

try {
  if (command === "list") {
    const rows = await db
      .select({ email: users.email, name: users.name, idpSubject: users.idpSubject, roles: users.roles, lastSeenAt: users.lastSeenAt })
      .from(users)
      .orderBy(asc(users.email));
    console.table(rows.map((r) => ({ ...r, roles: r.roles.join(", ") || "-" })));
  } else if ((command === "grant" || command === "revoke") && who && isRole(roleArg)) {
    const roles =
      command === "grant"
        ? sql`(SELECT array_agg(DISTINCT r ORDER BY r) FROM unnest(array_append(${users.roles}, ${roleArg})) r)`
        : sql`array_remove(${users.roles}, ${roleArg})`;
    let [row] = await db.update(users).set({ roles }).where(byWho(who)).returning();
    if (!row && command === "grant" && !who.includes("@")) {
      [row] = await db.insert(users).values({ idpSubject: who, roles: [roleArg] }).returning();
    }
    if (!row) {
      console.error(`No user matches ${who}. They need to sign in once first, or use their FerrisKey user id.`);
      process.exitCode = 1;
    } else {
      console.log(`${row.email ?? row.idpSubject}: ${row.roles.join(", ") || "(no roles)"}`);
    }
  } else {
    usage();
  }
} finally {
  await db.pool.end();
}
