// The whole site as one Hono app: the API under /api, everything else rendered by React Router.
// Vite builds this file as the server entry (see vite.config.ts); server.js runs it.
import { app as api, assertProductionConfig } from "@ignite/api";
import { Hono } from "hono";
import { createRequestHandler } from "react-router";

assertProductionConfig();

const handleRequest = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export const app = new Hono()
  .route("/", api)
  .all("*", (c) => handleRequest(c.req.raw));
