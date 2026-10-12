import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useRouteLoaderData,
} from "react-router";
import type { Route } from "./+types/root";
import "./app.css";
import { api } from "./lib/api.server";
import type { SessionUser } from "./lib/types";
import { getLocale, i18nextMiddleware } from "./middleware/i18next";

export const middleware: Route.MiddlewareFunction[] = [i18nextMiddleware];

export const links: Route.LinksFunction = () => [{ rel: "icon", type: "image/png", href: "/favicon.png" }];

export async function loader({ context, request }: Route.LoaderArgs) {
  // Who is signed in (via the API's session cookie). A failure here must not take pages down.
  const { user } = await api<{ user: SessionUser | null }>("/session", { request }).catch((error) => {
    console.error("session lookup failed", error);
    return { user: null };
  });
  return { locale: getLocale(context), user };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>("root");
  const { i18n } = useTranslation();
  const locale = data?.locale ?? i18n.language;
  return (
    <html lang={locale} dir={i18n.dir(locale)}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  const { i18n } = useTranslation();
  useEffect(() => {
    if (i18n.language !== loaderData.locale) void i18n.changeLanguage(loaderData.locale);
  }, [loaderData.locale, i18n]);
  return (
    <Outlet />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { t } = useTranslation();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">{notFound ? t("errors.notFound") : t("errors.generic")}</h1>
      {notFound && <p className="mt-2 text-muted-foreground">{t("errors.notFoundBody")}</p>}
      {import.meta.env.DEV && error instanceof Error && (
        <pre className="mt-4 overflow-x-auto rounded bg-muted p-4 text-sm">{error.stack}</pre>
      )}
      <a className="mt-6 inline-block text-primary underline" href="/">
        {t("errors.home")}
      </a>
    </main>
  );
}
