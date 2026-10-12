import { ExternalLink } from "lucide-react";
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

  if (!edition) return <p className="text-muted-foreground">{t("jobs.noEdition")}</p>;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {loaderData.archived ? localized(edition.title, lang) : t("jobs.heading")}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t("jobs.asOf", { date: dateFormat.format(new Date(edition.publishedAt)) })}
        </p>
      </div>

      <Form method="get" role="search" className="bg-card grid gap-4 rounded-lg border p-4 md:grid-cols-[2fr_1fr_1fr_1fr_auto] md:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="q">{t("jobs.searchLabel")}</Label>
          <Input id="q" name="q" type="search" defaultValue={filters.q ?? ""} placeholder={t("jobs.searchPlaceholder")} />
        </div>
        <TermSelect name="industry" label={t("jobs.industry")} emptyLabel={t("jobs.allIndustries")} terms={taxonomies.industries} value={filters.industry ?? null} lang={lang} />
        <TermSelect name="jobType" label={t("jobs.jobType")} emptyLabel={t("jobs.allJobTypes")} terms={taxonomies.jobTypes} value={filters.jobType ?? null} lang={lang} />
        <TermSelect name="location" label={t("jobs.location")} emptyLabel={t("jobs.allLocations")} terms={taxonomies.locations} value={filters.location ?? null} lang={lang} />
        <div className="flex gap-2">
          <Button type="submit">{t("jobs.search")}</Button>
          {filtered && (
            <Button variant="ghost" asChild>
              <Link to=".">{t("jobs.clear")}</Link>
            </Button>
          )}
        </div>
      </Form>

      <p className="text-muted-foreground text-sm" aria-live="polite">
        {t("jobs.results", { count: postings.length })}
      </p>

      {postings.length === 0 ? (
        <p>{t("jobs.empty")}</p>
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

function PostingRow({ posting, lang }: { posting: Posting; lang: string }) {
  const { t } = useTranslation();
  const href = safeHref(posting.url);
  const location = posting.location ? localized(posting.location.name, lang) : posting.locationText;
  return (
    <li className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="grid gap-1">
        <h2 className="font-semibold" lang={posting.language ?? undefined}>
          <Link to={`/${lang}/jobs/${posting.id}`} className="underline-offset-4 hover:underline">
            {posting.title}
          </Link>
          {posting.isNew && (
            <Badge className="ml-2 align-middle">{t("jobs.new")}</Badge>
          )}
        </h2>
        <p className="text-muted-foreground text-sm">
          {[posting.organization, location].filter(Boolean).join(" · ")}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {posting.industry && <Badge variant="secondary">{localized(posting.industry.name, lang)}</Badge>}
          {posting.jobType && <Badge variant="outline">{localized(posting.jobType.name, lang)}</Badge>}
        </div>
      </div>
      {href && (
        <Button variant="outline" size="sm" asChild>
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
