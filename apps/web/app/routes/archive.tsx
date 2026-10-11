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
        <p className="text-muted-foreground">{t("archive.empty")}</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {editions.map((edition) => (
            <li key={edition.id} className="p-4">
              <Link to={edition.id} className="font-medium underline-offset-4 hover:underline">
                {localized(edition.title, lang)}
              </Link>
              <p className="text-muted-foreground text-sm">
                <time dateTime={edition.publishedAt}>{dateFormat.format(new Date(edition.publishedAt))}</time>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
