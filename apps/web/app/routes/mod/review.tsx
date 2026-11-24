import { Archive, ArrowLeft, Building2, CalendarClock, CalendarDays, Check, ExternalLink, FileText, MapPin, RotateCcw, Save, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link, data, useFetcher, useOutletContext } from "react-router";
import { FormStatus, TermSelect, TextField } from "~/components/form";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { localized } from "~/i18n";
import { api, ApiError } from "~/lib/api.server";
import { actionError, formValue, modApi } from "~/lib/mod.server";
import { decodeEntities, platformName } from "~/lib/platforms";
import type { ModPosting, PostingStatus, Taxonomies } from "~/lib/types";
import { safeHref } from "~/lib/utils";
import type { Route } from "./+types/review";
import type { QueueContext } from "./queue";

// The reading pane of the review queue: one posting, its classification and its description.

type Detail = ModPosting & { description: string | null };

// Which status each button moves a posting to; "save" keeps the current one.
const INTENTS: Record<string, PostingStatus | undefined> = {
  approve: "approved",
  reject: "rejected",
  reopen: "pending",
  close: "closed",
  save: undefined,
};

export async function loader(args: Route.LoaderArgs) {
  try {
    const [posting, taxonomies] = await Promise.all([
      modApi<Detail>(args, `/postings/${encodeURIComponent(args.params.postingId)}`),
      api<Taxonomies>("/taxonomies"),
    ]);
    return { posting, taxonomies };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.code === "invalid_input")) throw data(null, { status: 404 });
    throw error;
  }
}

export async function action(args: Route.ActionArgs) {
  const form = await args.request.formData();
  const intent = String(form.get("intent"));
  if (!(intent in INTENTS)) return { ok: false as const, error: "invalid_input" };
  try {
    await modApi(args, `/postings/${encodeURIComponent(args.params.postingId)}`, {
      method: "PATCH",
      body: {
        title: formValue(form, "title") ?? "",
        organization: formValue(form, "organization") ?? undefined,
        locationId: formValue(form, "locationId"),
        industryId: formValue(form, "industryId"),
        jobTypeId: formValue(form, "jobTypeId"),
        reviewNotes: formValue(form, "reviewNotes") ?? "",
        status: INTENTS[intent],
      },
    });
    return { ok: true as const, status: INTENTS[intent] ?? null };
  } catch (error) {
    return actionError(error);
  }
}

export default function Review({ loaderData, params }: Route.ComponentProps) {
  // Keyed by posting so the form, its defaults and the fetcher start fresh for each one.
  return <ReviewPane key={loaderData.posting.id} {...loaderData} lang={params.lang} />;
}

function ReviewPane({ posting, taxonomies, lang }: { posting: Detail; taxonomies: Taxonomies; lang: string }) {
  const { t } = useTranslation();
  const queue = useOutletContext<QueueContext>();
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const invalid = (field: string) => fetcher.data?.ok === false && "fields" in fetcher.data && fetcher.data.fields?.includes(field);
  const id = posting.id;
  const href = safeHref(posting.url);
  const dateFormat = new Intl.DateTimeFormat(lang, { dateStyle: "medium" });
  const platform = posting.origin === "scraped" ? platformName(posting.platform) : null;
  const location = posting.location ? localized(posting.location.name, lang) : posting.locationText;

  // After a successful review, update the list: approve/reject/close moves on to the next posting.
  const result = fetcher.state === "idle" ? fetcher.data : undefined;
  const { onReviewed, onSaved } = queue;
  const submitted = fetcher.formData;
  // Act on each result once. Without this, the list update gives onReviewed a new identity, the
  // effect re-runs with the same result, and it navigates again — an endless navigation loop.
  const handled = useRef<typeof result>(undefined);
  useEffect(() => {
    if (!result?.ok || result === handled.current) return;
    handled.current = result;
    if (result.status) onReviewed(id, result.status);
  }, [result, id, onReviewed]);
  useEffect(() => {
    // Mirror edited fields into the list while the save is in flight (optimistic).
    if (!submitted) return;
    const title = submitted.get("title");
    const organization = submitted.get("organization");
    onSaved(id, {
      ...(typeof title === "string" && title.trim() ? { title: title.trim() } : {}),
      ...(typeof organization === "string" && organization.trim() ? { organization: organization.trim() } : {}),
    });
  }, [submitted, id, onSaved]);

  return (
    <article className="grid">
      <header className="grid gap-3 border-b p-4">
        <Link to={queue.listHref} className="text-muted-foreground -ml-2 inline-flex items-center gap-1.5 justify-self-start rounded-md px-2 py-1 text-sm hover:bg-accent hover:text-foreground md:hidden">
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t("mod.review.backToQueue")}
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline">
            {platform ? t("mod.review.origin.scrapedFrom", { platform }) : t(`mod.review.origin.${posting.origin}`)}
          </Badge>
          <Badge variant="secondary">{t(`mod.review.tabs.${posting.status}`)}</Badge>
          {href && (
            <a href={href} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">
              {t("mod.review.viewOriginal")}
              <ExternalLink aria-hidden="true" className="size-3.5" />
              <span className="sr-only">{t("jobs.opensInNewTab")}</span>
            </a>
          )}
        </div>
        <h2 className="text-xl font-bold tracking-tight text-balance" lang={posting.language ?? undefined}>
          {posting.title}
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
          {posting.postedAt && (
            <li className="inline-flex items-center gap-1.5">
              <CalendarDays aria-hidden="true" />
              {t("mod.review.posted", { date: dateFormat.format(new Date(posting.postedAt)) })}
            </li>
          )}
          {posting.closesAt && (
            <li className="inline-flex items-center gap-1.5">
              <CalendarClock aria-hidden="true" />
              {t("mod.review.closes", { date: dateFormat.format(new Date(posting.closesAt)) })}
            </li>
          )}
        </ul>
      </header>

      <fetcher.Form method="post" className="grid" aria-busy={busy}>
        {/* Actions stay in reach while the description scrolls underneath. */}
        <div className="bg-card/95 supports-[backdrop-filter]:bg-card/80 sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b px-4 py-3 backdrop-blur">
          {posting.status !== "approved" && (
            <Button type="submit" name="intent" value="approve" disabled={busy}>
              <Check aria-hidden="true" />
              {t("mod.review.approve")}
            </Button>
          )}
          {posting.status !== "rejected" && (
            <Button type="submit" name="intent" value="reject" variant="outline" disabled={busy}>
              <X aria-hidden="true" />
              {t("mod.review.reject")}
            </Button>
          )}
          {posting.status === "approved" && (
            <Button type="submit" name="intent" value="close" variant="outline" disabled={busy}>
              <Archive aria-hidden="true" />
              {t("mod.review.close")}
            </Button>
          )}
          {posting.status !== "pending" && (
            <Button type="submit" name="intent" value="reopen" variant="ghost" disabled={busy}>
              <RotateCcw aria-hidden="true" />
              {t("mod.review.reopen")}
            </Button>
          )}
          <Button type="submit" name="intent" value="save" variant="ghost" disabled={busy}>
            <Save aria-hidden="true" />
            {t("mod.review.save")}
          </Button>
          <div className="ml-auto">
            <FormStatus result={result} success={t("mod.review.saved")} />
          </div>
        </div>

        <div className="grid gap-4 p-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <TextField name="title" idPrefix={id} label={t("mod.review.title")} defaultValue={posting.title} required invalid={invalid("title")} />
            <TextField name="organization" idPrefix={id} label={t("mod.review.organization")} defaultValue={posting.organization ?? ""} invalid={invalid("organization")} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <TermSelect
              name="locationId"
              idPrefix={id}
              label={t("mod.review.location")}
              help={posting.locationText ? t("mod.review.locationAsWritten", { text: posting.locationText }) : undefined}
              terms={taxonomies.locations}
              value={posting.locationId}
              emptyLabel={t("mod.notSet")}
              lang={lang}
              valueKey="id"
            />
            <TermSelect name="industryId" idPrefix={id} label={t("mod.review.industry")} terms={taxonomies.industries} value={posting.industryId} emptyLabel={t("mod.notSet")} lang={lang} valueKey="id" />
            <TermSelect name="jobTypeId" idPrefix={id} label={t("mod.review.jobType")} terms={taxonomies.jobTypes} value={posting.jobTypeId} emptyLabel={t("mod.notSet")} lang={lang} valueKey="id" />
          </div>
          <TextField name="reviewNotes" idPrefix={id} label={t("mod.review.notes")} defaultValue={posting.reviewNotes ?? ""} />
        </div>
      </fetcher.Form>

      <section aria-labelledby={`${id}-description`} className="grid gap-3 border-t p-4">
        <h3 id={`${id}-description`} className="inline-flex items-center gap-1.5 font-semibold">
          <FileText aria-hidden="true" className="size-4" />
          {t("mod.review.description")}
        </h3>
        {posting.description ? (
          <div
            lang={posting.language ?? undefined}
            className="max-w-prose space-y-3 text-sm leading-relaxed [&_a]:underline [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
            // Sanitized by the API (apps/api/src/sanitize.ts).
            dangerouslySetInnerHTML={{ __html: posting.description }}
          />
        ) : posting.excerpt ? (
          <p className="max-w-prose text-sm leading-relaxed">{decodeEntities(posting.excerpt)}</p>
        ) : (
          <p className="text-muted-foreground text-sm">{t("mod.review.noDescription")}</p>
        )}
      </section>
    </article>
  );
}

export function ErrorBoundary() {
  const { t } = useTranslation();
  const queue = useOutletContext<QueueContext | undefined>();
  return (
    <div className="text-muted-foreground grid h-full place-content-center justify-items-center gap-3 p-10 text-center">
      <p>{t("mod.review.notFound")}</p>
      {queue && (
        <Link to={queue.listHref} className="text-foreground text-sm font-medium underline underline-offset-4">
          {t("mod.review.backToQueue")}
        </Link>
      )}
    </div>
  );
}
