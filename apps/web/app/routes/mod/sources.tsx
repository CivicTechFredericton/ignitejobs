import { Ban, CircleCheck, Globe, Loader2, PackageX, PencilLine, Plus, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Form, Link, useFetcher, useNavigation, useRevalidator } from "react-router";
import { Field, FormStatus, NativeSelect, TextField } from "~/components/form";
import { Button } from "~/components/ui/button";
import { actionError, formValue, modApi } from "~/lib/mod.server";
import { hostOf, platformName } from "~/lib/platforms";
import type { Source } from "~/lib/types";
import type { Route } from "./+types/sources";

export async function loader(args: Route.LoaderArgs) {
  return { sources: await modApi<Source[]>(args, "/sources") };
}

export async function action(args: Route.ActionArgs) {
  const form = await args.request.formData();
  try {
    if (form.get("intent") === "scrape") {
      await modApi(args, `/sources/${encodeURIComponent(String(form.get("id")))}/scrape`, { method: "POST" });
      return { ok: true as const, intent: "scrape" };
    }
    await modApi(args, "/sources", {
      method: "POST",
      body: { url: formValue(form, "url") ?? "", kind: formValue(form, "kind") },
    });
    return { ok: true as const, intent: "add" };
  } catch (error) {
    return actionError(error);
  }
}

/** While any scrape is queued or running, reload the list every few seconds. */
function useLiveRefresh(active: boolean) {
  const revalidator = useRevalidator();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && revalidator.state === "idle") revalidator.revalidate();
    }, 3000);
    return () => clearInterval(timer);
  }, [active, revalidator]);
}

const inProgress = (source: Source) => source.lastJob?.status === "queued" || source.lastJob?.status === "running";

export default function Sources({ loaderData, actionData, params }: Route.ComponentProps) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const adding = navigation.state === "submitting";
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (actionData?.ok) formRef.current?.reset();
  }, [actionData]);
  const invalid = (field: string) => actionData?.ok === false && actionData.fields?.includes(field);
  const live = loaderData.sources.some(inProgress);
  useLiveRefresh(live);

  return (
    <div className="grid gap-6">
      <p className="text-muted-foreground">{t("mod.sources.intro")}</p>

      <section aria-labelledby="add-source" className="bg-card grid gap-4 rounded-lg border p-4">
        <h2 id="add-source" className="font-semibold">
          {t("mod.sources.addHeading")}
        </h2>
        <Form ref={formRef} method="post" className="grid gap-4 md:grid-cols-[2fr_1fr_auto] md:items-end">
          <TextField name="url" type="url" label={t("mod.sources.url")} placeholder="https://" required invalid={invalid("url")} />
          <Field name="kind" label={t("mod.sources.kind")}>
            {(ids) => (
              <NativeSelect name="kind" defaultValue="posting" {...ids}>
                <option value="posting">{t("mod.sources.kinds.posting")}</option>
                <option value="careers_page">{t("mod.sources.kinds.careers_page")}</option>
              </NativeSelect>
            )}
          </Field>
          <Button type="submit" disabled={adding}>
            {adding ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Plus aria-hidden="true" />}
            {t("mod.sources.add")}
          </Button>
        </Form>
        <FormStatus result={actionData} success={t("mod.sources.added")} />
      </section>

      <section aria-labelledby="source-list" className="grid gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="source-list" className="font-semibold">
            {t("mod.sources.heading")}
          </h2>
          {live && (
            <p role="status" className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              {t("mod.sources.live")}
            </p>
          )}
        </div>
        {loaderData.sources.length === 0 ? (
          <p className="text-muted-foreground">{t("mod.sources.empty")}</p>
        ) : (
          // Below md each row becomes a card (source + button, then result and count); a real table from md up.
          <div className="rounded-lg border bg-card md:overflow-x-auto">
            <table className="block w-full text-sm md:table">
              <thead className="bg-muted/50 sr-only text-left md:not-sr-only md:table-header-group">
                <tr>
                  <th scope="col" className="p-3 font-medium">{t("mod.sources.columns.source")}</th>
                  <th scope="col" className="p-3 font-medium">{t("mod.sources.columns.result")}</th>
                  <th scope="col" className="p-3 text-right font-medium">{t("mod.sources.columns.postings")}</th>
                  <th scope="col" className="p-3"><span className="sr-only">{t("mod.sources.scrapeNow")}</span></th>
                </tr>
              </thead>
              <tbody className="block divide-y md:table-row-group">
                {loaderData.sources.map((source) => (
                  <SourceRow key={source.id} source={source} lang={params.lang} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

type Tone = "progress" | "ok" | "neutral" | "warning" | "refused";

const TONE_CLASS: Record<Tone, string> = {
  progress: "text-muted-foreground",
  ok: "text-emerald-700 dark:text-emerald-400",
  neutral: "text-muted-foreground",
  warning: "text-amber-700 dark:text-amber-400",
  refused: "text-destructive",
};

const TONE_ICON = {
  progress: Loader2,
  ok: CircleCheck,
  neutral: PackageX,
  warning: TriangleAlert,
  refused: Ban,
} as const;

/** Turn the last scrape job into a short, translated verdict for moderators. */
function describe(source: Source, t: (key: string, options?: Record<string, unknown>) => string) {
  const job = source.lastJob;
  const platform = platformName(source.platform);
  if (source.status === "manual_only" || job?.outcome === "manual_only")
    return { tone: "refused" as Tone, label: t("mod.sources.result.manualOnly"), help: t("mod.sources.result.manualOnlyHelp"), manual: true };
  if (!job?.status) return { tone: "neutral" as Tone, label: t("mod.sources.result.notYet") };
  if (job.status === "running") return { tone: "progress" as Tone, label: t("mod.sources.result.running") };
  if (job.status === "queued") {
    if (job.outcome === "escalated")
      return { tone: "progress" as Tone, label: t("mod.sources.result.waitingBrowser"), help: t("mod.sources.result.waitingBrowserHelp") };
    if (job.lastError)
      return { tone: "warning" as Tone, label: t("mod.sources.result.retrying"), help: t("mod.sources.result.retryingHelp"), details: true };
    return { tone: "progress" as Tone, label: t("mod.sources.result.queued") };
  }
  if (job.status === "succeeded") {
    const via =
      job.strategy === "platform_api" && platform
        ? t("mod.sources.result.via.platform_api", { platform })
        : job.strategy
          ? t(`mod.sources.result.via.${job.strategy}`)
          : "";
    // Postings already found through another source keep that source; say so instead of "0".
    const elsewhere = source.postingCount === 0 && (job.found ?? 0) > 0;
    return {
      tone: "ok" as Tone,
      label: t("mod.sources.result.succeeded"),
      help: elsewhere ? `${via}. ${t("mod.sources.result.alreadyListed")}` : via,
    };
  }
  if (job.outcome === "gone")
    return { tone: "neutral" as Tone, label: t("mod.sources.result.gone"), help: t("mod.sources.result.goneHelp") };
  if (job.outcome === "no_postings")
    return { tone: "warning" as Tone, label: t("mod.sources.result.noPostings"), help: t("mod.sources.result.noPostingsHelp"), manual: true };
  if (job.status === "blocked" || source.status === "blocked")
    return { tone: "refused" as Tone, label: t("mod.sources.result.blocked"), help: t("mod.sources.blockedHelp"), manual: true, details: true };
  return { tone: "warning" as Tone, label: t("mod.sources.result.failed"), help: t("mod.sources.result.failedHelp"), manual: true, details: true };
}

function SourceRow({ source, lang }: { source: Source; lang: string }) {
  const { t } = useTranslation();
  const fetcher = useFetcher<typeof action>();
  const dateFormat = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" });
  const job = source.lastJob;
  const verdict = describe(source, t);
  const Icon = TONE_ICON[verdict.tone];
  const when = job?.finishedAt ?? (job?.status === "succeeded" ? source.lastScrapedAt : null);
  const platform = platformName(source.platform);
  const busy = fetcher.state !== "idle" || inProgress(source);

  return (
    <tr className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 p-3 align-top md:table-row md:p-0">
      <td className="min-w-0 md:max-w-sm md:p-3">
        <a href={source.url} target="_blank" rel="noopener noreferrer" className="font-medium [overflow-wrap:anywhere] underline-offset-4 hover:underline">
          {hostOf(source.url)}
        </a>
        <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs">
          {platform ?? (
            <span className="inline-flex items-center gap-1">
              <Globe aria-hidden="true" className="size-3" />
              {t("mod.sources.website")}
            </span>
          )}
          <span aria-hidden="true">·</span>
          {t(`mod.sources.kinds.${source.kind}`)}
        </div>
      </td>
      <td className="col-span-2 row-start-2 md:p-3">
        <div className={`flex items-center gap-1.5 font-medium ${TONE_CLASS[verdict.tone]}`}>
          <Icon aria-hidden="true" className={`size-4 shrink-0 ${verdict.tone === "progress" ? "animate-spin" : ""}`} />
          {verdict.label}
        </div>
        {verdict.help && <div className="text-muted-foreground mt-0.5 max-w-sm text-xs">{verdict.help}</div>}
        {when && <div className="text-muted-foreground mt-0.5 text-xs">{dateFormat.format(new Date(when))}</div>}
        {verdict.manual && (
          <Link to={`/${lang}/mod/new?url=${encodeURIComponent(source.url)}`} className="mt-1 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-4">
            <PencilLine aria-hidden="true" className="size-3.5" />
            {t("mod.sources.enterManually")}
          </Link>
        )}
        {verdict.details && job?.lastError && (
          <details className="text-muted-foreground mt-1 max-w-sm text-xs">
            <summary className="cursor-pointer select-none">{t("mod.sources.result.details")}</summary>
            <p className="mt-1 font-mono break-all">{job.lastError}</p>
          </details>
        )}
      </td>
      <td className="col-span-2 row-start-3 text-sm tabular-nums md:p-3 md:text-right">
        <span className="text-muted-foreground md:hidden">{t("mod.sources.columns.postings")}: </span>
        {source.postingCount > 0 ? (
          <Link
            to={`/${lang}/mod?source=${source.id}`}
            className="font-medium underline underline-offset-4"
            aria-label={t("mod.sources.viewPostings", { count: source.postingCount, host: hostOf(source.url) })}
          >
            {source.postingCount}
          </Link>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </td>
      <td className="col-start-2 row-start-1 text-right md:p-3">
        <fetcher.Form method="post">
          <input type="hidden" name="id" value={source.id} />
          <Button type="submit" name="intent" value="scrape" size="sm" variant="outline" disabled={busy}>
            <RefreshCw aria-hidden="true" className={busy ? "animate-spin" : undefined} />
            {t("mod.sources.scrapeNow")}
          </Button>
        </fetcher.Form>
      </td>
    </tr>
  );
}
