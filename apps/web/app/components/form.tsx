import type { ComponentProps, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { TaxonomyTerm } from "~/lib/types";
import { cn } from "~/lib/utils";
import { localized } from "~/i18n";

type FieldProps = {
  name: string;
  label: string;
  help?: string;
  invalid?: boolean;
  className?: string;
  /** Makes element ids unique when the same form appears several times on a page. */
  idPrefix?: string;
};

/** Label + control + help text, wired up with ids and aria attributes. */
export function Field({ name, label, help, invalid, className, idPrefix, children }: FieldProps & { children: (ids: ControlIds) => ReactNode }) {
  const ids = controlIds(idPrefix ? `${idPrefix}-${name}` : name, help, invalid);
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={ids.id}>{label}</Label>
      {children(ids)}
      {help && (
        <p id={`${ids.id}-help`} className="text-muted-foreground text-xs">
          {help}
        </p>
      )}
    </div>
  );
}

type ControlIds = { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean };

function controlIds(key: string, help?: string, invalid?: boolean): ControlIds {
  const id = `field-${key}`;
  return { id, "aria-describedby": help ? `${id}-help` : undefined, "aria-invalid": invalid || undefined };
}

export function TextField({ name, label, help, invalid, className, idPrefix, ...input }: FieldProps & Omit<ComponentProps<typeof Input>, "id">) {
  return (
    <Field name={name} label={label} help={help} invalid={invalid} className={className} idPrefix={idPrefix}>
      {(ids) => <Input name={name} {...ids} {...input} />}
    </Field>
  );
}

// A native <select> works without JavaScript and is fully accessible.
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive h-9 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]",
        className,
      )}
      {...props}
    />
  );
}

export function TermSelect({
  name,
  label,
  terms,
  value,
  emptyLabel,
  lang,
  help,
  invalid,
  className,
  idPrefix,
  valueKey = "slug",
}: FieldProps & {
  terms: TaxonomyTerm[];
  value: string | null;
  emptyLabel: string;
  lang: string;
  /** Public filters submit slugs (readable URLs); moderator forms submit ids. */
  valueKey?: "slug" | "id";
}) {
  return (
    <Field name={name} label={label} help={help} invalid={invalid} className={className} idPrefix={idPrefix}>
      {(ids) => (
        <NativeSelect name={name} defaultValue={value ?? ""} {...ids}>
          <option value="">{emptyLabel}</option>
          {terms.map((term) => (
            <option key={term.id} value={term[valueKey]}>
              {localized(term.name, lang)}
            </option>
          ))}
        </NativeSelect>
      )}
    </Field>
  );
}

/** Shows an action's outcome; errors are API codes translated via errors.codes.*. */
export function FormStatus({ result, success }: { result?: { ok: boolean; error?: string } | null; success?: string }) {
  const { t } = useTranslation();
  if (!result) return null;
  if (result.ok) return success ? <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{success}</p> : null;
  return (
    <p role="alert" className="text-destructive text-sm">
      {t(`errors.codes.${result.error}`, { defaultValue: t("errors.codes.unknown_error") })}
    </p>
  );
}
