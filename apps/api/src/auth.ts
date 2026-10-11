import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { env } from "./env.ts";

export type Role = "moderator" | "admin";

// Requires the Clerk session token to be customised with
// {"metadata": "{{user.public_metadata}}"} and moderators to have publicMetadata.role set.
declare global {
  interface CustomJwtSessionClaims {
    metadata?: { role?: Role };
  }
}

export type AuthVariables = { userId: string; role: Role };

const passthrough: MiddlewareHandler = async (_c, next) => next();

export const authenticate: MiddlewareHandler = env.clerkConfigured ? clerkMiddleware() : passthrough;

export const requireModerator = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  if (env.devModerator) {
    c.set("userId", "dev-moderator");
    c.set("role", "admin");
    return next();
  }
  const auth = env.clerkConfigured ? getAuth(c) : null;
  if (!auth?.userId) return c.json({ error: "unauthenticated" }, 401);
  const role = auth.sessionClaims?.metadata?.role;
  if (role !== "moderator" && role !== "admin") return c.json({ error: "forbidden" }, 403);
  c.set("userId", auth.userId);
  c.set("role", role);
  return next();
});
