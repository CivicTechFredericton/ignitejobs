import { serve } from "@hono/node-server";
import { app } from "./app.ts";
import { assertProductionConfig, env } from "./env.ts";

assertProductionConfig();

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});
