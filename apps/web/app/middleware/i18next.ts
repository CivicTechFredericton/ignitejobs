import { initReactI18next } from "react-i18next";
import { createCookie } from "react-router";
import { createI18nextMiddleware } from "remix-i18next";
import { defaultLocale, i18nOptions, isLocale, locales } from "~/i18n";

export const localeCookie = createCookie("lng", {
  path: "/",
  sameSite: "lax",
  maxAge: 60 * 60 * 24 * 365,
});

export const [i18nextMiddleware, getLocale, getInstance] = createI18nextMiddleware({
  detection: {
    supportedLanguages: [...locales],
    fallbackLanguage: defaultLocale,
    cookie: localeCookie,
    // The /en or /fr prefix wins; on "/" fall back to the cookie, then Accept-Language.
    async findLocale({ request }) {
      const prefix = new URL(request.url).pathname.split("/")[1];
      return isLocale(prefix) ? prefix : null;
    },
  },
  i18next: i18nOptions,
  plugins: [initReactI18next],
});
