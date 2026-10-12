import { useTranslation } from "react-i18next";
import { Form, redirect, useNavigation } from "react-router";
import { FormStatus, TextField } from "~/components/form";
import { Button } from "~/components/ui/button";
import { actionError, formValue, modApi } from "~/lib/mod.server";
import type { EditionPreview, PostingSummary } from "~/lib/types";
import { getInstance } from "~/middleware/i18next";
import { locales } from "~/i18n";
import type { Route } from "./+types/publish";

export async function loader(args: Route.LoaderArgs) {
  const preview = await modApi<EditionPreview>(args, "/editions/preview");
  // Suggest a title in every language, e.g. "Job opportunities — October 12, 2026".
  const i18n = getInstance(args.context);
  const now = new Date();
  const defaultTitles = Object.fromEntries(
    locales.map((code) => [
      code,
      i18n.t("mod.publish.defaultTitle", {
        lng: code,
        date: new Intl.DateTimeFormat(code, { dateStyle: "long" }).format(now),
      }),
    ]),
  );
  return { preview, defaultTitles };
}

export async function action(args: Route.ActionArgs) {
  const form = await args.request.formData();
  const title = Object.fromEntries(locales.map((code) => [code, formValue(form, `title.${code}`) ?? ""]));
  try {
    await modApi(args, "/editions", { method: "POST", body: { title } });
  } catch (error) {
    return actionError(error);
  }
  return redirect(`/${args.params.lang}`);
}

export default function Publish({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { preview, defaultTitles } = loaderData;
  const submitting = useNavigation().state === "submitting";
  const firstEdition = !preview.previousEditionId;
  const unchanged = !firstEdition && preview.added.length === 0 && preview.removed.length === 0;
  const invalid = (field: string) => actionData?.ok === false && actionData.fields?.some((f) => f.startsWith(field));

  return (
    <div className="grid max-w-3xl gap-6">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold">{t("mod.publish.heading")}</h2>
        <p className="text-muted-foreground">{t("mod.publish.intro")}</p>
      </div>

      <p className="font-medium">{t("mod.publish.total", { count: preview.total })}</p>
      {firstEdition && <p>{t("mod.publish.firstEdition")}</p>}
      {unchanged && <p>{t("mod.publish.noChanges")}</p>}

      {!firstEdition && preview.added.length > 0 && (
        <ChangeList heading={t("mod.publish.added", { count: preview.added.length })} postings={preview.added} />
      )}
      {preview.removed.length > 0 && (
        <ChangeList heading={t("mod.publish.removed", { count: preview.removed.length })} postings={preview.removed} />
      )}

      <Form method="post" className="bg-card grid gap-4 rounded-lg border p-4">
        {locales.map((code) => (
          <TextField
            key={code}
            name={`title.${code}`}
            label={t(code === "en" ? "mod.publish.titleEn" : "mod.publish.titleFr")}
            defaultValue={defaultTitles[code]}
            lang={code}
            required
            invalid={invalid("title")}
          />
        ))}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={submitting || preview.total === 0}>
            {t("mod.publish.submit")}
          </Button>
          <FormStatus result={actionData} />
        </div>
      </Form>
    </div>
  );
}

function ChangeList({ heading, postings }: { heading: string; postings: PostingSummary[] }) {
  return (
    <section className="grid gap-2">
      <h3 className="font-semibold">{heading}</h3>
      <ul className="bg-card divide-y rounded-lg border text-sm">
        {postings.map((posting) => (
          <li key={posting.id} className="p-3">
            <span className="font-medium">{posting.title}</span>
            {posting.organization && <span className="text-muted-foreground"> · {posting.organization}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
