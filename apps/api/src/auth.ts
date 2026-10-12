import type { Role } from "@ignite/db";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { env } from "./env.ts";
import { SESSION_COOKIE, userForSession } from "./session.ts";
import type { CurrentUser } from "./users.ts";

export type AuthVariables = {
  /** The users.id of the signed-in person, recorded on rows moderators create or review. */
  userId: string;
  user: CurrentUser;
};

const DEV_USER: CurrentUser = { id: "dev-moderator", idpSubject: "dev-moderator", email: null, name: "Dev moderator", roles: ["admin"] };

/** Load the signed-in user from the session cookie, if any. Never rejects a request. */
export const authenticate = createMiddleware<{ Variables: Partial<AuthVariables> }>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  const user = env.devModerator ? DEV_USER : token ? await userForSession(token) : null;
  if (user) {
    c.set("user", user);
    c.set("userId", user.id);
  }
  return next();
});

export const requireSignedIn = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  if (!c.get("user")) return c.json({ error: "unauthenticated" }, 401);
  return next();
});

const MODERATION_ROLES: Role[] = ["moderator", "admin"];

/** FerrisKey proves who the user is (via the session); their roles come from the users table. */
export const requireModerator = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthenticated" }, 401);
  if (!user.roles.some((role) => MODERATION_ROLES.includes(role))) return c.json({ error: "forbidden" }, 403);
  return next();
});
