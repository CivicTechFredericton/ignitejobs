import { serve } from "@hono/node-server";
import { app } from "./app.ts";
import { env } from "./env.ts";

if (env.production && !env.clerkConfigured) throw new Error("Clerk keys are required in production");

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});
