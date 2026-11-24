// Runs the site (React Router + the API) as one Node server.
//   development: Vite in middleware mode, with HMR; server/app.ts is reloaded on change.
//   production:  the build from `react-router build`; static files from build/client.
import { getRequestListener, serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

const PORT = Number(process.env.PORT ?? 3000);
const production = process.env.NODE_ENV === "production";

if (production) {
  const { app } = await import("./build/server/index.js");
  const server = new Hono()
    .use("/assets/*", serveStatic({
      root: "./build/client",
      onFound: (_path, c) => c.header("Cache-Control", "public, max-age=31536000, immutable"),
    }))
    .use("*", serveStatic({ root: "./build/client" }))
    .route("/", app);
  serve({ fetch: server.fetch, port: PORT }, (info) => {
    console.log(`listening on http://localhost:${info.port}`);
  });
} else {
  const { createServer } = await import("node:http");
  const server = createServer();
  // HMR shares this server's port; Vite's default separate port (24678) collides when two
  // dev servers run at once (e.g. dev + e2e), which silently breaks hot reload.
  const vite = await import("vite").then((v) =>
    v.createServer({ server: { middlewareMode: true, hmr: { server } } }),
  );
  const handle = getRequestListener(async (request) => {
    const { app } = await vite.ssrLoadModule("./server/app.ts");
    return app.fetch(request);
  });
  server.on("request", (req, res) => {
    vite.middlewares(req, res, () => {
      handle(req, res).catch((error) => {
        vite.ssrFixStacktrace(error);
        console.error(error);
        res.statusCode = 500;
        res.end();
      });
    });
  });
  server.listen(PORT, () => console.log(`dev server on http://localhost:${PORT}`));
}
