import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Form, Link, useFetcher, useNavigation } from "react-router";
import { Field, FormStatus, NativeSelect, TextField } from "~/components/form";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { actionError, formValue, modApi } from "~/lib/mod.server";
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

const statusVariant = { active: "secondary", paused: "outline", blocked: "destructive", manual_only: "outline" } as const;

export default function Sources({ loaderData, actionData, params }: Route.ComponentProps) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const adding = navigation.state === "submitting";
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (actionData?.ok) formRef.current?.reset();
  }, [actionData]);
  const invalid = (field: string) => actionData?.ok === false && actionData.fields?.includes(field);

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
            {t("mod.sources.add")}
          </Button>
        </Form>
        <FormStatus result={actionData} success={t("mod.sources.added")} />
      </section>

      <section aria-labelledby="source-list" className="grid gap-2">
        <h2 id="source-list" className="font-semibold">
          {t("mod.sources.heading")}
        </h2>
        {loaderData.sources.length === 0 ? (
          <p className="text-muted-foreground">{t("mod.sources.empty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th scope="col" className="p-3 font-medium">{t("mod.sources.columns.source")}</th>
                  <th scope="col" className="p-3 font-medium">{t("mod.sources.columns.platform")}</th>
                  <th scope="col" className="p-3 font-medium">{t("mod.sources.columns.status")}</th>
                  <th scope="col" className="p-3 font-medium">{t("mod.sources.columns.lastRun")}</th>
                  <th scope="col" className="p-3 text-right font-medium">{t("mod.sources.columns.postings")}</th>
                  <th scope="col" className="p-3"><span className="sr-only">{t("mod.sources.scrapeNow")}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
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

function SourceRow({ source, lang }: { source: Source; lang: string }) {
  const { t } = useTranslation();
  const fetcher = useFetcher<typeof action>();
  const dateFormat = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" });
  const job = source.lastJob;
  const needsManual = source.status === "blocked" || source.status === "manual_only";
  return (
    <tr className="align-top">
      <td className="max-w-xs p-3">
        <a href={source.url} target="_blank" rel="noopener noreferrer" className="font-medium break-all underline-offset-4 hover:underline">
          {source.domain}
        </a>
        <div className="text-muted-foreground text-xs">{t(`mod.sources.kinds.${source.kind}`)}</div>
      </td>
      <td className="p-3">{source.platform}</td>
      <td className="p-3">
        <Badge variant={statusVariant[source.status]}>{t(`mod.sources.statuses.${source.status}`)}</Badge>
        {needsManual && (
          <div className="mt-1 grid gap-1 text-xs">
            <span className="text-muted-foreground">{t("mod.sources.blockedHelp")}</span>
            <Link to={`/${lang}/mod/new?url=${encodeURIComponent(source.url)}`} className="underline underline-offset-4">
              {t("mod.sources.enterManually")}
            </Link>
          </div>
        )}
      </td>
      <td className="p-3">
        {job?.status ? (
          <>
            <div>{t(`mod.sources.jobStatuses.${job.status}`)}</div>
            <div className="text-muted-foreground text-xs">
              {source.lastScrapedAt ? dateFormat.format(new Date(source.lastScrapedAt)) : t("mod.sources.never")}
            </div>
            {job.lastError && (
              <div className="text-destructive mt-1 max-w-xs text-xs break-words" title={job.lastError}>
                {job.lastError.length > 120 ? `${job.lastError.slice(0, 120)}…` : job.lastError}
              </div>
            )}
          </>
        ) : (
          t("mod.sources.never")
        )}
      </td>
      <td className="p-3 text-right tabular-nums">{source.postingCount}</td>
      <td className="p-3">
        <fetcher.Form method="post">
          <input type="hidden" name="id" value={source.id} />
          <Button type="submit" name="intent" value="scrape" size="sm" variant="outline" disabled={fetcher.state !== "idle"}>
            {t("mod.sources.scrapeNow")}
          </Button>
        </fetcher.Form>
        {fetcher.state === "idle" && fetcher.data?.ok && <p role="status" className="text-muted-foreground mt-1 text-xs">{t("mod.sources.queued")}</p>}
      </td>
    </tr>
  );
}
