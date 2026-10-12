import { useTranslation } from "react-i18next";
import { Form, redirect, useNavigation } from "react-router";
import { Field, FormStatus, NativeSelect, TermSelect, TextField } from "~/components/form";
import { Button } from "~/components/ui/button";
import { api } from "~/lib/api.server";
import { actionError, formValue, modApi } from "~/lib/mod.server";
import type { Taxonomies } from "~/lib/types";
import { locales } from "~/i18n";
import type { Route } from "./+types/new-posting";

export async function loader(args: Route.LoaderArgs) {
  // Reached from a blocked source via "Enter manually": prefill its URL.
  const url = new URL(args.request.url).searchParams.get("url");
  await modApi(args, "/me");
  return { taxonomies: await api<Taxonomies>("/taxonomies"), prefillUrl: url ?? "" };
}

export async function action(args: Route.ActionArgs) {
  const form = await args.request.formData();
  const closesAt = formValue(form, "closesAt");
  try {
    await modApi(args, "/postings", {
      method: "POST",
      body: {
        title: formValue(form, "title") ?? "",
        url: formValue(form, "url") ?? "",
        organization: formValue(form, "organization") ?? "",
        locationText: formValue(form, "locationText") ?? undefined,
        locationId: formValue(form, "locationId"),
        industryId: formValue(form, "industryId"),
        jobTypeId: formValue(form, "jobTypeId"),
        language: formValue(form, "language") ?? undefined,
        closesAt,
      },
    });
  } catch (error) {
    return actionError(error);
  }
  return redirect(`/${args.params.lang}/mod?status=approved`);
}

export default function NewPosting({ loaderData, actionData, params }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { taxonomies, prefillUrl } = loaderData;
  const submitting = useNavigation().state === "submitting";
  const invalid = (field: string) => actionData?.ok === false && actionData.fields?.includes(field);
  const lang = params.lang;
  return (
    <div className="grid max-w-3xl gap-4">
      <h2 className="text-lg font-semibold">{t("mod.newPosting.heading")}</h2>
      <p className="text-muted-foreground">{t("mod.newPosting.intro")}</p>
      <Form method="post" className="bg-card grid gap-4 rounded-lg border p-4">
        <TextField name="title" label={t("mod.newPosting.title")} required invalid={invalid("title")} />
        <TextField name="url" type="url" label={t("mod.newPosting.url")} defaultValue={prefillUrl} placeholder="https://" required invalid={invalid("url")} />
        <TextField name="organization" label={t("mod.newPosting.organization")} required invalid={invalid("organization")} />
        <div className="grid gap-4 md:grid-cols-2">
          <TextField name="locationText" label={t("mod.newPosting.locationText")} invalid={invalid("locationText")} />
          <TermSelect name="locationId" label={t("mod.newPosting.location")} help={t("mod.newPosting.locationHelp")} terms={taxonomies.locations} value={null} emptyLabel={t("mod.notSet")} lang={lang} valueKey="id" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <TermSelect name="industryId" label={t("mod.newPosting.industry")} terms={taxonomies.industries} value={null} emptyLabel={t("mod.notSet")} lang={lang} valueKey="id" />
          <TermSelect name="jobTypeId" label={t("mod.newPosting.jobType")} terms={taxonomies.jobTypes} value={null} emptyLabel={t("mod.notSet")} lang={lang} valueKey="id" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field name="language" label={t("mod.newPosting.language")}>
            {(ids) => (
              <NativeSelect name="language" defaultValue={lang} {...ids}>
                {locales.map((code) => (
                  <option key={code} value={code}>
                    {t(`languages.${code}`)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <TextField name="closesAt" type="date" label={t("mod.newPosting.closesAt")} invalid={invalid("closesAt")} />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={submitting}>
            {t("mod.newPosting.submit")}
          </Button>
          <FormStatus result={actionData} />
        </div>
      </Form>
    </div>
  );
}
