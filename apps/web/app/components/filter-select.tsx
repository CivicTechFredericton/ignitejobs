import { Label } from "~/components/ui/label";
import type { Term } from "~/lib/types";
import { localized } from "~/i18n";

// A native <select> so the search form works before (and without) JavaScript.
export function FilterSelect(props: {
  name: string;
  label: string;
  allLabel: string;
  terms: Term[];
  value: string | null;
  lang: string;
}) {
  const id = `filter-${props.name}`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{props.label}</Label>
      <select
        id={id}
        name={props.name}
        defaultValue={props.value ?? ""}
        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
      >
        <option value="">{props.allLabel}</option>
        {props.terms.map((term) => (
          <option key={term.slug} value={term.slug}>
            {localized(term.name, props.lang)}
          </option>
        ))}
      </select>
    </div>
  );
}
