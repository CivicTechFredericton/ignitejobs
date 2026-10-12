import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import { FormStatus, TermSelect, TextField } from "~/components/form";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { api } from "~/lib/api.server";
import { actionError, formValue, modApi } from "~/lib/mod.server";
import type { ModPosting, PostingStatus, Taxonomies } from "~/lib/types";
import { safeHref } from "~/lib/utils";
import type { Route } from "./+types/review";

const STATUSES: PostingStatus[] = ["pending", "approved", "rejected", "closed"];

// Which status each button moves a posting to; "save" keeps the current one.
const INTENTS: Record<string, PostingStatus | undefined> = {
  approve: "approved",
  reject: "rejected",
  reopen: "pending",
  close: "closed",
  save: undefined,
};

export async function loader(args: Route.LoaderArgs) {
  const requested = new URL(args.request.url).searchParams.get("status");
  const status = STATUSES.find((s) => s === requested) ?? "pending";
  const [postings, taxonomies] = await Promise.all([
    modApi<ModPosting[]>(args, `/postings?status=${status}`),
    api<Taxonomies>("/taxonomies"),
  ]);
  return { status, postings, taxonomies };
}

export async function action(args: Route.ActionArgs) {
  const form = await args.request.formData();
  const intent = String(form.get("intent"));
  if (!(intent in INTENTS)) return { ok: false as const, error: "invalid_input" };
  try {
    await modApi(args, `/postings/${encodeURIComponent(String(form.get("id")))}`, {
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
    return { ok: true as const };
  } catch (error) {
    return actionError(error);
  }
}

export default function Review({ loaderData, actionData, params }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { status, postings, taxonomies } = loaderData;
  return (
    <div className="grid gap-4">
      <h2 className="sr-only">{t("mod.review.heading")}</h2>
      <nav className="flex flex-wrap gap-2" aria-label={t("mod.review.heading")}>
        {STATUSES.map((s) => (
          <Button key={s} asChild size="sm" variant={s === status ? "default" : "outline"}>
            <Link to={`?status=${s}`} aria-current={s === status ? "page" : undefined}>
              {t(`mod.review.tabs.${s}`)}
            </Link>
          </Button>
        ))}
      </nav>
      {/* Cards submit through fetchers; this only shows when a form was posted without JavaScript. */}
      <FormStatus result={actionData} success={t("mod.review.saved")} />
      {postings.length === 0 ? (
        <p className="text-muted-foreground">{t("mod.review.empty")}</p>
      ) : (
        <ul className="grid gap-4">
          {postings.map((posting) => (
            <li key={posting.id}>
              <ReviewCard posting={posting} taxonomies={taxonomies} lang={params.lang} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewCard({ posting, taxonomies, lang }: { posting: ModPosting; taxonomies: Taxonomies; lang: string }) {
  const { t } = useTranslation();
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const invalid = (field: string) => fetcher.data?.ok === false && "fields" in fetcher.data && fetcher.data.fields?.includes(field);
  const href = safeHref(posting.url);
  const id = posting.id;

  return (
    <fetcher.Form method="post" className="bg-card grid gap-4 rounded-lg border p-4" aria-busy={busy}>
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline">{t(`mod.review.origin.${posting.origin}`)}</Badge>
        {posting.locationText && (
          <span className="text-muted-foreground">{t("mod.review.locationAsWritten", { text: posting.locationText })}</span>
        )}
        {href && (
          <a href={href} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 underline-offset-4 hover:underline">
            {t("mod.review.viewOriginal")}
            <ExternalLink aria-hidden="true" className="size-3.5" />
            <span className="sr-only">{t("jobs.opensInNewTab")}</span>
          </a>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TextField name="title" idPrefix={id} label={t("mod.review.title")} defaultValue={posting.title} required invalid={invalid("title")} />
        <TextField name="organization" idPrefix={id} label={t("mod.review.organization")} defaultValue={posting.organization ?? ""} invalid={invalid("organization")} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <TermSelect name="locationId" idPrefix={id} label={t("mod.review.location")} terms={taxonomies.locations} value={posting.locationId} emptyLabel={t("mod.notSet")} lang={lang} valueKey="id" />
        <TermSelect name="industryId" idPrefix={id} label={t("mod.review.industry")} terms={taxonomies.industries} value={posting.industryId} emptyLabel={t("mod.notSet")} lang={lang} valueKey="id" />
        <TermSelect name="jobTypeId" idPrefix={id} label={t("mod.review.jobType")} terms={taxonomies.jobTypes} value={posting.jobTypeId} emptyLabel={t("mod.notSet")} lang={lang} valueKey="id" />
      </div>
      <TextField name="reviewNotes" idPrefix={id} label={t("mod.review.notes")} defaultValue={posting.reviewNotes ?? ""} />

      <div className="flex flex-wrap items-center gap-2">
        {posting.status !== "approved" && (
          <Button type="submit" name="intent" value="approve" disabled={busy}>
            {t("mod.review.approve")}
          </Button>
        )}
        {posting.status !== "rejected" && (
          <Button type="submit" name="intent" value="reject" variant="outline" disabled={busy}>
            {t("mod.review.reject")}
          </Button>
        )}
        {posting.status === "approved" && (
          <Button type="submit" name="intent" value="close" variant="outline" disabled={busy}>
            {t("mod.review.close")}
          </Button>
        )}
        {posting.status !== "pending" && (
          <Button type="submit" name="intent" value="reopen" variant="ghost" disabled={busy}>
            {t("mod.review.reopen")}
          </Button>
        )}
        <Button type="submit" name="intent" value="save" variant="ghost" disabled={busy}>
          {t("mod.review.save")}
        </Button>
        <FormStatus result={fetcher.state === "idle" ? fetcher.data : null} success={t("mod.review.saved")} />
      </div>
    </fetcher.Form>
  );
}
