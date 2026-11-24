import { Briefcase, CircleUser, History, Languages, LogIn, LogOut, ShieldCheck } from "lucide-react";
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

// Header links share one look: icon + label, a comfortable tap target, and a filled pill when active.
const navItem = "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors [&_svg]:size-4 [&_svg]:shrink-0";
const navClass = ({ isActive }: { isActive: boolean }) =>
  `${navItem} ${isActive ? "bg-accent font-semibold text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`;

function LanguageSwitch({ lang }: { lang: string }) {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  const other = lang === "en" ? "fr" : "en";
  const href = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, `/${other}`) + search;
  return (
    <a href={href} hrefLang={other} lang={other} aria-label={t("switchLanguageLabel")} className={`${navItem} font-medium hover:bg-accent md:order-last`}>
      <Languages aria-hidden="true" />
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
  const linkClass = `${navItem} text-muted-foreground hover:bg-accent hover:text-foreground`;
  if (!user) {
    return (
      <a href={signInHref(pathname + search)} className={linkClass}>
        <LogIn aria-hidden="true" />
        {t("auth.signIn")}
      </a>
    );
  }
  return (
    <>
      {user.roles.length > 0 && (
        <NavLink to={`/${lang}/mod`} className={navClass}>
          <ShieldCheck aria-hidden="true" />
          {t("nav.moderate")}
        </NavLink>
      )}
      <form method="post" action="/api/auth/logout" className="flex shrink-0 items-center">
        <span className="text-muted-foreground hidden max-w-48 items-center gap-1.5 truncate px-2 text-xs lg:inline-flex" title={user.email ?? undefined}>
          <CircleUser aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">{user.name ?? user.email}</span>
        </span>
        <button type="submit" className={`${linkClass} cursor-pointer`} title={user.email ?? undefined}>
          <LogOut aria-hidden="true" />
          {t("auth.signOut")}
        </button>
      </form>
    </>
  );
}

export default function LocaleLayout({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { site, lang } = loaderData;
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-background focus:p-2 focus:shadow">
        {t("skipToContent")}
      </a>
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 pt-3 md:py-3">
          <Link to={`/${lang}`} className="flex min-w-0 flex-1 basis-0 items-center gap-3">
            {site.branding.logoUrl && (
              // The logo is decorative next to the site name, which already says who this is.
              <img src={site.branding.logoUrl} alt="" className="h-10 w-auto" width={712} height={293} />
            )}
            <span className={site.branding.logoUrl ? "border-l pl-3" : undefined}>
              <span className="block text-lg leading-tight font-bold text-balance">{localized(site.name, lang)}</span>
              <span className="block text-xs text-muted-foreground">{localized(site.region, lang)}</span>
            </span>
          </Link>
          {/* On phones the nav drops to its own row and scrolls sideways instead of wrapping. */}
          <nav aria-label={t("nav.label")} className="order-last -mx-4 flex w-[calc(100%+2rem)] items-center gap-1 overflow-x-auto border-t px-3 py-2 md:order-none md:mx-0 md:w-auto md:border-0 md:p-0">
            <NavLink to={`/${lang}`} end className={navClass}>
              <Briefcase aria-hidden="true" />
              {t("nav.jobs")}
            </NavLink>
            <NavLink to={`/${lang}/archive`} className={navClass}>
              <History aria-hidden="true" />
              {t("nav.archive")}
            </NavLink>
            <AccountLinks lang={lang} />
          </nav>
          {/* Outside the scrolling nav so it stays visible next to the site name on phones. */}
          <LanguageSwitch lang={lang} />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </>
  );
}
