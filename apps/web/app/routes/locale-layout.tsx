import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet, data, useLocation, useRouteLoaderData } from "react-router";
import { api } from "~/lib/api.server";
import { signInHref } from "~/lib/auth";
import type { Site } from "~/lib/types";
import { isLocale, localized } from "~/i18n";
import { localeCookie } from "~/middleware/i18next";
import type { loader as rootLoader } from "~/root";
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

// Sign-in and sign-out go straight to the API (/api/auth/*), which runs the FerrisKey flow,
// so they are plain links and forms rather than router navigations.
function AccountLinks({ lang }: { lang: string }) {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  const user = useRouteLoaderData<typeof rootLoader>("root")?.user;
  const linkClass = "text-sm text-muted-foreground hover:text-foreground";
  if (!user) {
    return (
      <a href={signInHref(pathname + search)} className={linkClass}>
        {t("auth.signIn")}
      </a>
    );
  }
  return (
    <>
      {user.roles.length > 0 && (
        <NavLink to={`/${lang}/mod`} className={({ isActive }) => (isActive ? "text-sm font-semibold" : linkClass)}>
          {t("nav.moderate")}
        </NavLink>
      )}
      <form method="post" action="/api/auth/logout" className="flex items-center gap-2">
        <span className="text-muted-foreground max-w-48 truncate text-xs" title={user.email ?? undefined}>
          {user.name ?? user.email}
        </span>
        <button type="submit" className={linkClass}>
          {t("auth.signOut")}
        </button>
      </form>
    </>
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
          <Link to={`/${lang}`} className="mr-auto flex items-center gap-3">
            {site.branding.logoUrl && (
              // The logo is decorative next to the site name, which already says who this is.
              <img src={site.branding.logoUrl} alt="" className="h-10 w-auto" width={712} height={293} />
            )}
            <span className={site.branding.logoUrl ? "border-l pl-3" : undefined}>
              <span className="block text-lg leading-tight font-bold">{localized(site.name, lang)}</span>
              <span className="block text-xs text-muted-foreground">{localized(site.region, lang)}</span>
            </span>
          </Link>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <NavLink to={`/${lang}`} end className={navClass}>
              {t("nav.jobs")}
            </NavLink>
            <NavLink to={`/${lang}/archive`} className={navClass}>
              {t("nav.archive")}
            </NavLink>
            <AccountLinks lang={lang} />
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
