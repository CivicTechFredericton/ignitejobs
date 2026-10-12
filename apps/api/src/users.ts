import { type Role, users } from "@ignite/db";
import { sql } from "drizzle-orm";
import { db } from "./db.ts";

export type CurrentUser = { id: string; idpSubject: string; email: string | null; name: string | null; roles: Role[] };

export const userColumns = {
  id: users.id,
  idpSubject: users.idpSubject,
  email: users.email,
  name: users.name,
  roles: users.roles,
};

type Claims = { sub: string; email?: unknown; name?: unknown; given_name?: unknown; family_name?: unknown };

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/** Create or refresh a user's row from their ID token claims. Granted roles are kept. */
export async function upsertUserFromClaims(claims: Claims): Promise<CurrentUser> {
  // FerrisKey sends given_name/family_name (possibly empty) rather than name.
  const name = text(claims.name) ?? text([text(claims.given_name), text(claims.family_name)].filter(Boolean).join(" "));
  const email = text(claims.email);
  const [row] = await db
    .insert(users)
    .values({ idpSubject: claims.sub, email, name, lastSeenAt: new Date() })
    .onConflictDoUpdate({
      target: users.idpSubject,
      set: {
        email: sql`coalesce(excluded.email, ${users.email})`,
        name: sql`coalesce(excluded.name, ${users.name})`,
        lastSeenAt: new Date(),
      },
    })
    .returning(userColumns);
  return row!;
}
