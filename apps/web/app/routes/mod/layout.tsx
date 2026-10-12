import { useTranslation } from "react-i18next";
import { NavLink, Outlet, isRouteErrorResponse, useLocation } from "react-router";
import { Button } from "~/components/ui/button";
import { signInHref } from "~/lib/auth";
import { Badge } from "~/components/ui/badge";
import { modApi } from "~/lib/mod.server";
import type { ModSummary } from "~/lib/types";
import type { Route } from "./+types/layout";

// Anonymous visitors and non-moderators get 401/403 from modApi; ErrorBoundary handles both.
export async function loader(args: Route.LoaderArgs) {
  return { summary: await modApi<ModSummary>(args, "/summary") };
}

export function meta() {
  return [{ name: "robots", content: "noindex" }];
}

export default function ModLayout({ loaderData, params }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { summary } = loaderData;
  const base = `/${params.lang}/mod`;
  const tab = ({ isActive }: { isActive: boolean }) =>
    `inline-flex items-center gap-2 border-b-2 px-1 pb-2 text-sm ${
      isActive ? "border-primary font-semibold" : "text-muted-foreground border-transparent hover:text-foreground"
    }`;
  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t("mod.heading")}</h1>
        <nav aria-label={t("mod.heading")} className="flex flex-wrap gap-x-6 gap-y-2 border-b">
          <NavLink to={base} end className={tab}>
            {t("mod.nav.review")}
            {summary.pendingPostings > 0 && <Badge>{summary.pendingPostings}</Badge>}
          </NavLink>
          <NavLink to={`${base}/sources`} className={tab}>
            {t("mod.nav.sources")}
            {summary.blockedSources > 0 && <Badge variant="destructive">{summary.blockedSources}</Badge>}
          </NavLink>
          <NavLink to={`${base}/new`} className={tab}>
            {t("mod.nav.new")}
          </NavLink>
          <NavLink to={`${base}/publish`} className={tab}>
            {t("mod.nav.publish")}
          </NavLink>
        </nav>
      </div>
      <Outlet />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  if (isRouteErrorResponse(error) && error.status === 401) {
    return (
      <div className="grid justify-items-center gap-4 py-8">
        <p>{t("mod.signInPrompt")}</p>
        <Button asChild>
          <a href={signInHref(pathname + search)}>{t("auth.signIn")}</a>
        </Button>
      </div>
    );
  }
  if (isRouteErrorResponse(error) && error.status === 403) {
    return (
      <div className="grid gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t("errors.forbidden")}</h1>
        <p>{t("mod.forbidden")}</p>
      </div>
    );
  }
  throw error;
}
