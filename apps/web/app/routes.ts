import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  // "/" redirects to /en or /fr based on cookie, then Accept-Language.
  index("routes/locale-redirect.tsx"),
  route(":lang", "routes/locale-layout.tsx", [
    index("routes/jobs.tsx"),
    route("archive", "routes/archive.tsx"),
    route("archive/:editionId", "routes/jobs.tsx", { id: "edition" }),
    route("jobs/:postingId", "routes/job.tsx"),
    route("mod", "routes/mod/layout.tsx", [
      // Review queue: the list on the left (layout), the selected posting on the right.
      layout("routes/mod/queue.tsx", [
        index("routes/mod/queue-index.tsx"),
        route("review/:postingId", "routes/mod/review.tsx"),
      ]),
      // Further pages of the queue, fetched as the list scrolls.
      route("queue", "routes/mod/queue-page.ts"),
      route("sources", "routes/mod/sources.tsx"),
      route("new", "routes/mod/new-posting.tsx"),
      route("publish", "routes/mod/publish.tsx"),
    ]),
  ]),
  // remix-i18next needs a catch-all so its middleware runs for unknown URLs too.
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
