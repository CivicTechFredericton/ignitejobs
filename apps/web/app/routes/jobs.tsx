import { Building2, CalendarClock, ExternalLink, MapPin, Search, SearchX, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Form, Link } from "react-router";
import { TermSelect } from "~/components/form";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { ApiError, api } from "~/lib/api.server";
import type { Edition, Posting, Taxonomies } from "~/lib/types";
import { safeHref } from "~/lib/utils";
import { localized } from "~/i18n";
import type { Route } from "./+types/jobs";

const FILTERS = ["q", "industry", "jobType", "location"] as const;

export async function loader({ params, request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const query = new URLSearchParams();
  for (const key of FILTERS) {
    const value = url.searchParams.get(key)?.trim();
    if (value) query.set(key, value);
  }
  const editionId = params.editionId ?? "latest";
  const [taxonomies, result] = await Promise.all([
    api<Taxonomies>("/taxonomies"),
    api<{ edition: Edition; postings: Posting[] }>(
      `/editions/${encodeURIComponent(editionId)}/postings?${query}`,
    ).catch((error) => {
      // No edition published yet is a normal state, not an error page.
      if (error instanceof ApiError && error.code === "edition_not_found" && editionId === "latest") {
        return { edition: null, postings: [] };
      }
      throw error;
    }),
  ]);
  const filters = Object.fromEntries(FILTERS.map((key) => [key, query.get(key)]));
  return { taxonomies, ...result, filters, lang: params.lang, archived: Boolean(params.editionId) };
}

export default function Jobs({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { taxonomies, edition, postings, filters, lang } = loaderData;
  const dateFormat = new Intl.DateTimeFormat(lang, { dateStyle: "long" });
  const filtered = FILTERS.some((key) => filters[key]);

  if (!edition) return <EmptyState>{t("jobs.noEdition")}</EmptyState>;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {loaderData.archived ? localized(edition.title, lang) : t("jobs.heading")}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          <time dateTime={edition.publishedAt}>{t("jobs.asOf", { date: dateFormat.format(new Date(edition.publishedAt)) })}</time>
        </p>
      </div>

      <Form method="get" role="search" className="bg-card grid gap-4 rounded-lg border p-4 sm:grid-cols-3 sm:items-end md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <div className="grid gap-1.5 sm:col-span-3 md:col-span-1">
          <Label htmlFor="q">{t("jobs.searchLabel")}</Label>
          <div className="relative">
            <Search aria-hidden="true" className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input id="q" name="q" type="search" defaultValue={filters.q ?? ""} placeholder={t("jobs.searchPlaceholder")} className="pl-9" />
          </div>
        </div>
        <TermSelect name="industry" label={t("jobs.industry")} emptyLabel={t("jobs.allIndustries")} terms={taxonomies.industries} value={filters.industry ?? null} lang={lang} />
        <TermSelect name="jobType" label={t("jobs.jobType")} emptyLabel={t("jobs.allJobTypes")} terms={taxonomies.jobTypes} value={filters.jobType ?? null} lang={lang} />
        <TermSelect name="location" label={t("jobs.location")} emptyLabel={t("jobs.allLocations")} terms={taxonomies.locations} value={filters.location ?? null} lang={lang} />
        <Button type="submit" className="w-full sm:col-span-3 md:col-span-1 md:w-auto">
          <Search aria-hidden="true" />
          {t("jobs.search")}
        </Button>
      </Form>

      <div className="-mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium" aria-live="polite">
          {t("jobs.results", { count: postings.length })}
        </p>
        {filtered && (
          <Button variant="ghost" size="sm" asChild>
            <Link to=".">
              <X aria-hidden="true" />
              {t("jobs.clear")}
            </Link>
          </Button>
        )}
      </div>

      {postings.length === 0 ? (
        <EmptyState icon={<SearchX aria-hidden="true" className="size-8" />}>{t("jobs.empty")}</EmptyState>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {postings.map((posting) => (
            <PostingRow key={posting.id} posting={posting} lang={lang} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground grid justify-items-center gap-3 rounded-lg border border-dashed p-10 text-center">
      {icon}
      <p>{children}</p>
    </div>
  );
}

function PostingRow({ posting, lang }: { posting: Posting; lang: string }) {
  const { t } = useTranslation();
  const href = safeHref(posting.url);
  const location = posting.location ? localized(posting.location.name, lang) : posting.locationText;
  const closes = posting.closesAt ? new Intl.DateTimeFormat(lang, { dateStyle: "medium" }).format(new Date(posting.closesAt)) : null;
  return (
    // The title link stretches over the whole card (after:inset-0), so anywhere on it opens the job.
    <li className="hover:bg-accent/50 relative flex flex-col gap-3 p-4 transition-colors sm:flex-row sm:items-start sm:justify-between">
      <div className="grid gap-1.5">
        <h2 className="font-semibold" lang={posting.language ?? undefined}>
          <Link to={`/${lang}/jobs/${posting.id}`} className="underline-offset-4 after:absolute after:inset-0 hover:underline focus-visible:outline-none after:focus-visible:rounded-sm after:focus-visible:ring-[3px] after:focus-visible:ring-ring/50">
            {posting.title}
          </Link>
          {posting.isNew && (
            <Badge className="ml-2 align-middle">{t("jobs.new")}</Badge>
          )}
        </h2>
        <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm [&_svg]:size-3.5 [&_svg]:shrink-0">
          {posting.organization && (
            <li className="inline-flex items-center gap-1.5">
              <Building2 aria-hidden="true" />
              {posting.organization}
            </li>
          )}
          {location && (
            <li className="inline-flex items-center gap-1.5">
              <MapPin aria-hidden="true" />
              {location}
            </li>
          )}
          {closes && (
            <li className="inline-flex items-center gap-1.5">
              <CalendarClock aria-hidden="true" />
              {t("jobs.closes", { date: closes })}
            </li>
          )}
        </ul>
        {(posting.industry || posting.jobType) && (
          <div className="flex flex-wrap gap-1.5">
            {posting.industry && <Badge variant="secondary">{localized(posting.industry.name, lang)}</Badge>}
            {posting.jobType && <Badge variant="outline">{localized(posting.jobType.name, lang)}</Badge>}
          </div>
        )}
      </div>
      {href && (
        // Sits above the stretched title link so it still opens the employer's page.
        <Button variant="outline" size="sm" asChild className="relative z-10 self-start">
          <a href={href} target="_blank" rel="noopener noreferrer">
            {t("jobs.apply")}
            <ExternalLink aria-hidden="true" />
            <span className="sr-only">{t("jobs.opensInNewTab")}</span>
          </a>
        </Button>
      )}
    </li>
  );
}
