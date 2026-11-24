import { CalendarDays, ChevronRight, History } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { api } from "~/lib/api.server";
import type { Edition } from "~/lib/types";
import { localized } from "~/i18n";
import type { Route } from "./+types/archive";

export async function loader({ params }: Route.LoaderArgs) {
  return { editions: await api<Edition[]>("/editions"), lang: params.lang };
}

export default function Archive({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { editions, lang } = loaderData;
  const dateFormat = new Intl.DateTimeFormat(lang, { dateStyle: "long" });
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold tracking-tight">{t("archive.heading")}</h1>
      {editions.length === 0 ? (
        <div className="text-muted-foreground grid justify-items-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <History aria-hidden="true" className="size-8" />
          <p>{t("archive.empty")}</p>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {editions.map((edition) => (
            <li key={edition.id}>
              <Link to={edition.id} className="group hover:bg-accent/50 flex items-center gap-3 p-4 transition-colors">
                <span className="grid flex-1 gap-0.5">
                  <span className="font-medium underline-offset-4 group-hover:underline">{localized(edition.title, lang)}</span>
                  <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
                    <CalendarDays aria-hidden="true" className="size-3.5" />
                    <time dateTime={edition.publishedAt}>{dateFormat.format(new Date(edition.publishedAt))}</time>
                  </span>
                </span>
                <ChevronRight aria-hidden="true" className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
