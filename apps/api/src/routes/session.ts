import { Hono } from "hono";
import { type AuthVariables, authenticate, requireSignedIn } from "../auth.ts";

// The web app calls this when someone signs in, so every Clerk user gets a users row
// (with their email and name) whether or not they ever open the moderation pages.
export const sessionRoutes = new Hono<{ Variables: AuthVariables }>()
  .use(authenticate, requireSignedIn)
  .post("/", (c) => c.json({ roles: c.get("user").roles }));
