import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import type { Role } from "@ignite/db";
import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { env } from "./env.ts";
import { type CurrentUser, currentUser, syncUser } from "./users.ts";

export type AuthVariables = {
  /** The Clerk user id, recorded on rows moderators create or review. */
  userId: string;
  user: CurrentUser;
};

const passthrough: MiddlewareHandler = async (_c, next) => next();

export const authenticate: MiddlewareHandler = env.clerkConfigured ? clerkMiddleware() : passthrough;

const MODERATION_ROLES: Role[] = ["moderator", "admin"];

/** Clerk proves who the user is; their roles come from the users table. */
export const requireModerator = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  if (env.devModerator) {
    c.set("userId", "dev-moderator");
    c.set("user", { id: "dev-moderator", clerkUserId: "dev-moderator", roles: ["admin"] });
    return next();
  }
  const auth = env.clerkConfigured ? getAuth(c) : null;
  if (!auth?.userId) return c.json({ error: "unauthenticated" }, 401);
  const user = await currentUser(auth.userId, c.get("clerk"));
  if (!user.roles.some((role) => MODERATION_ROLES.includes(role))) {
    return c.json({ error: "forbidden" }, 403);
  }
  c.set("userId", auth.userId);
  c.set("user", user);
  return next();
});

/** Any signed-in user, moderator or not. Records them in the users table. */
export const requireSignedIn = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const auth = env.clerkConfigured ? getAuth(c) : null;
  if (!auth?.userId) return c.json({ error: "unauthenticated" }, 401);
  c.set("userId", auth.userId);
  c.set("user", await syncUser(auth.userId, c.get("clerk")));
  return next();
});
