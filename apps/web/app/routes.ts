import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  // "/" redirects to /en or /fr based on cookie, then Accept-Language.
  index("routes/locale-redirect.tsx"),
  route(":lang", "routes/locale-layout.tsx", [
    index("routes/jobs.tsx"),
    route("archive", "routes/archive.tsx"),
    route("archive/:editionId", "routes/jobs.tsx", { id: "edition" }),
    route("mod", "routes/mod.tsx"),
  ]),
  // remix-i18next needs a catch-all so its middleware runs for unknown URLs too.
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
