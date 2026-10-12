import { createHash, randomBytes } from "node:crypto";
import { sessions, users } from "@ignite/db";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "./db.ts";
import { env } from "./env.ts";
import { type CurrentUser, userColumns } from "./users.ts";

export const SESSION_COOKIE = "ignite_session";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export const sessionCookieOptions = () => ({
  path: "/",
  httpOnly: true,
  secure: env.production,
  sameSite: "Lax" as const,
  maxAge: env.sessionTtlHours * 60 * 60,
});

/** Start a session and return the token for the cookie. Only its hash is stored. */
export async function createSession(userId: string, idToken: string | undefined) {
  const token = randomBytes(32).toString("base64url");
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date())); // opportunistic cleanup
  await db.insert(sessions).values({
    tokenHash: hash(token),
    userId,
    idToken,
    expiresAt: sql`now() + make_interval(hours => ${env.sessionTtlHours})`,
  });
  return token;
}

export async function userForSession(token: string): Promise<CurrentUser | null> {
  const [row] = await db
    .select(userColumns)
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hash(token)), gt(sessions.expiresAt, new Date())));
  return row ?? null;
}

/** End a session; returns its ID token so the identity provider session can be ended too. */
export async function deleteSession(token: string) {
  const [row] = await db
    .delete(sessions)
    .where(eq(sessions.tokenHash, hash(token)))
    .returning({ idToken: sessions.idToken });
  return row?.idToken ?? null;
}
