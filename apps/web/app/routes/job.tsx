import { ArrowLeft, Building2, CalendarClock, CalendarDays, ExternalLink, Languages, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, data } from "react-router";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { ApiError, api } from "~/lib/api.server";
import type { Posting } from "~/lib/types";
import { safeHref } from "~/lib/utils";
import { localized } from "~/i18n";
import type { Route } from "./+types/job";

export async function loader({ params }: Route.LoaderArgs) {
  try {
    // The API sanitizes the description HTML before returning it.
    const posting = await api<Posting & { description: string | null }>(`/postings/${encodeURIComponent(params.postingId)}`);
    return { posting, lang: params.lang };
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) throw data(null, { status: 404 });
    throw error;
  }
}

export function meta({ loaderData }: Route.MetaArgs) {
  return loaderData ? [{ title: [loaderData.posting.title, loaderData.posting.organization].filter(Boolean).join(" — ") }] : [];
}

export default function Job({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { posting, lang } = loaderData;
  const href = safeHref(posting.url);
  const dateFormat = new Intl.DateTimeFormat(lang, { dateStyle: "long" });
  const location = posting.location ? localized(posting.location.name, lang) : posting.locationText;
  const contentLang = posting.language && posting.language !== lang ? posting.language : null;

  return (
    <article className="grid max-w-3xl gap-6">
      <Link to={`/${lang}`} className="text-muted-foreground -ml-2 inline-flex items-center gap-1.5 justify-self-start rounded-md px-2 py-1 text-sm hover:bg-accent hover:text-foreground">
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t("jobs.back")}
      </Link>

      <header className="grid gap-3">
        <h1 className="text-2xl font-bold tracking-tight" lang={posting.language ?? undefined}>
          {posting.title}
        </h1>
        <ul className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1.5 [&_svg]:size-4 [&_svg]:shrink-0">
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
        </ul>
        {(posting.industry || posting.jobType) && (
          <div className="flex flex-wrap gap-1.5">
            {posting.industry && <Badge variant="secondary">{localized(posting.industry.name, lang)}</Badge>}
            {posting.jobType && <Badge variant="outline">{localized(posting.jobType.name, lang)}</Badge>}
          </div>
        )}
        {(posting.postedAt || posting.closesAt) && (
          <ul className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1 text-sm [&_svg]:size-4 [&_svg]:shrink-0">
            {posting.postedAt && (
              <li className="inline-flex items-center gap-1.5">
                <CalendarDays aria-hidden="true" />
                {t("jobs.posted", { date: dateFormat.format(new Date(posting.postedAt)) })}
              </li>
            )}
            {posting.closesAt && (
              <li className="text-foreground inline-flex items-center gap-1.5 font-medium">
                <CalendarClock aria-hidden="true" />
                {t("jobs.closes", { date: dateFormat.format(new Date(posting.closesAt)) })}
              </li>
            )}
          </ul>
        )}
        {href && <ApplyButton href={href} />}
      </header>

      <section className="grid gap-2" aria-labelledby="description-heading">
        <h2 id="description-heading" className="text-lg font-semibold">
          {t("jobs.description")}
        </h2>
        {contentLang && (
          <p className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
            <Languages aria-hidden="true" className="size-4" />
            {t("jobs.contentLanguage", { language: t(`languages.${contentLang}`, { defaultValue: contentLang }) })}
          </p>
        )}
        {posting.description ? (
          <div
            lang={posting.language ?? undefined}
            className="max-w-prose space-y-3 leading-relaxed [&_a]:underline [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
            // Sanitized by the API (apps/api/src/sanitize.ts).
            dangerouslySetInnerHTML={{ __html: posting.description }}
          />
        ) : (
          <p>{t("jobs.noDescription")}</p>
        )}
      </section>

      {/* Long descriptions push the first button off screen; repeat it where the reader finishes. */}
      {href && posting.description && (
        <div className="border-t pt-6">
          <ApplyButton href={href} />
        </div>
      )}
    </article>
  );
}

function ApplyButton({ href }: { href: string }) {
  const { t } = useTranslation();
  return (
    <Button asChild size="lg" className="justify-self-start">
      <a href={href} target="_blank" rel="noopener noreferrer">
        {t("jobs.apply")}
        <ExternalLink aria-hidden="true" />
        <span className="sr-only">{t("jobs.opensInNewTab")}</span>
      </a>
    </Button>
  );
}
