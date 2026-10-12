import { type Role, users } from "@ignite/db";
import { eq, sql } from "drizzle-orm";
import { db } from "./db.ts";

export type CurrentUser = { id: string; clerkUserId: string; roles: Role[] };

const columns = { id: users.id, clerkUserId: users.clerkUserId, roles: users.roles };

/** The slice of Clerk's backend client used here (the one @hono/clerk-auth puts on the context). */
type ClerkUsers = {
  users: {
    getUser(id: string): Promise<{ fullName: string | null; primaryEmailAddress: { emailAddress: string } | null }>;
  };
};

/** Create or refresh a user's row from their Clerk profile. Called when they sign in. */
export async function syncUser(clerkUserId: string, clerk?: ClerkUsers): Promise<CurrentUser> {
  // Best effort: a Clerk API hiccup must not stop the row being recorded.
  const profile = await clerk?.users.getUser(clerkUserId).catch(() => null);
  const email = profile?.primaryEmailAddress?.emailAddress ?? null;
  const name = profile?.fullName ?? null;
  const [row] = await db
    .insert(users)
    .values({ clerkUserId, email, name, lastSeenAt: new Date() })
    .onConflictDoUpdate({
      target: users.clerkUserId,
      set: {
        email: sql`coalesce(excluded.email, ${users.email})`,
        name: sql`coalesce(excluded.name, ${users.name})`,
        lastSeenAt: new Date(),
      },
    })
    .returning(columns);
  return row!;
}

/** Load the users row behind a moderator request, creating it if sign-in sync never ran. */
export async function currentUser(clerkUserId: string, clerk?: ClerkUsers): Promise<CurrentUser> {
  const [existing] = await db
    .update(users)
    .set({ lastSeenAt: new Date() })
    // Only touch last_seen_at every few minutes rather than on every request.
    .where(sql`${users.clerkUserId} = ${clerkUserId} AND (${users.lastSeenAt} IS NULL OR ${users.lastSeenAt} < now() - interval '5 minutes')`)
    .returning(columns);
  if (existing) return existing;
  const [found] = await db.select(columns).from(users).where(eq(users.clerkUserId, clerkUserId));
  return found ?? syncUser(clerkUserId, clerk);
}
