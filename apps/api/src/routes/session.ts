import { Hono } from "hono";
import { type AuthVariables, authenticate } from "../auth.ts";

// Who is signed in, if anyone. The web app calls this on every page to render the header.
export const sessionRoutes = new Hono<{ Variables: Partial<AuthVariables> }>()
  .use(authenticate)
  .get("/", (c) => {
    const user = c.get("user");
    return c.json({ user: user ? { email: user.email, name: user.name, roles: user.roles } : null });
  });
