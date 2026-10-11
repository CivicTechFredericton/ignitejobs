import { Hono } from "hono";
import { logger } from "hono/logger";
import { modRoutes } from "./routes/mod.ts";
import { publicRoutes } from "./routes/public.ts";

export const app = new Hono()
  .basePath("/api")
  .use(logger())
  .get("/health", (c) => c.json({ ok: true }))
  .route("/", publicRoutes)
  .route("/mod", modRoutes)
  .onError((err, c) => {
    console.error(err);
    return c.json({ error: "internal_error" }, 500);
  });

export type App = typeof app;
