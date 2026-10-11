import { Show, SignInButton, UserButton } from "@clerk/react-router";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet, data, useLocation } from "react-router";
import { api } from "~/lib/api.server";
import type { Site } from "~/lib/types";
import { isLocale, localized } from "~/i18n";
import { localeCookie } from "~/middleware/i18next";
import type { Route } from "./+types/locale-layout";

export async function loader({ params }: Route.LoaderArgs) {
  if (!isLocale(params.lang)) throw data(null, { status: 404 });
  const site = await api<Site>("/site");
  // Remember the choice so "/" sends returning visitors to the same language.
  return data(
    { site, lang: params.lang },
    { headers: { "Set-Cookie": await localeCookie.serialize(params.lang) } },
  );
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [];
  return [{ title: localized(loaderData.site.name, loaderData.lang) }];
}

function LanguageSwitch({ lang }: { lang: string }) {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  const other = lang === "en" ? "fr" : "en";
  const href = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, `/${other}`) + search;
  return (
    <a href={href} hrefLang={other} lang={other} aria-label={t("switchLanguageLabel")} className="text-sm font-medium underline-offset-4 hover:underline">
      {t("switchLanguage")}
    </a>
  );
}

export default function LocaleLayout({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { site, lang } = loaderData;
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm ${isActive ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`;
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-2">
        {t("skipToContent")}
      </a>
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link to={`/${lang}`} className="mr-auto">
            <span className="block text-lg font-bold">{localized(site.name, lang)}</span>
            <span className="block text-xs text-muted-foreground">{localized(site.region, lang)}</span>
          </Link>
          <nav className="flex items-center gap-4">
            <NavLink to={`/${lang}`} end className={navClass}>
              {t("nav.jobs")}
            </NavLink>
            <NavLink to={`/${lang}/archive`} className={navClass}>
              {t("nav.archive")}
            </NavLink>
            <Show when="signed-in">
              <NavLink to={`/${lang}/mod`} className={navClass}>
                {t("nav.moderate")}
              </NavLink>
              <UserButton />
            </Show>
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button type="button" className="text-sm text-muted-foreground hover:text-foreground">
                  {t("auth.signIn")}
                </button>
              </SignInButton>
            </Show>
            <LanguageSwitch lang={lang} />
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </>
  );
}
