import { ArrowLeft, ExternalLink } from "lucide-react";
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
      <Link to={`/${lang}`} className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:text-foreground">
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t("jobs.back")}
      </Link>

      <header className="grid gap-2">
        <h1 className="text-2xl font-bold tracking-tight" lang={posting.language ?? undefined}>
          {posting.title}
        </h1>
        <p className="text-muted-foreground">{[posting.organization, location].filter(Boolean).join(" · ")}</p>
        <div className="flex flex-wrap gap-1.5">
          {posting.industry && <Badge variant="secondary">{localized(posting.industry.name, lang)}</Badge>}
          {posting.jobType && <Badge variant="outline">{localized(posting.jobType.name, lang)}</Badge>}
        </div>
        <dl className="text-muted-foreground flex flex-wrap gap-x-4 text-sm">
          {posting.postedAt && <dd>{t("jobs.posted", { date: dateFormat.format(new Date(posting.postedAt)) })}</dd>}
          {posting.closesAt && <dd>{t("jobs.closes", { date: dateFormat.format(new Date(posting.closesAt)) })}</dd>}
        </dl>
        {href && (
          <Button asChild className="justify-self-start">
            <a href={href} target="_blank" rel="noopener noreferrer">
              {t("jobs.apply")}
              <ExternalLink aria-hidden="true" />
              <span className="sr-only">{t("jobs.opensInNewTab")}</span>
            </a>
          </Button>
        )}
      </header>

      <section className="grid gap-2" aria-labelledby="description-heading">
        <h2 id="description-heading" className="text-lg font-semibold">
          {t("jobs.description")}
        </h2>
        {contentLang && (
          <p className="text-muted-foreground text-sm">
            {t("jobs.contentLanguage", { language: t(`languages.${contentLang}`, { defaultValue: contentLang }) })}
          </p>
        )}
        {posting.description ? (
          <div
            lang={posting.language ?? undefined}
            className="max-w-none space-y-3 [&_a]:underline [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
            // Sanitized by the API (apps/api/src/sanitize.ts).
            dangerouslySetInnerHTML={{ __html: posting.description }}
          />
        ) : (
          <p>{t("jobs.noDescription")}</p>
        )}
      </section>
    </article>
  );
}
