import type { InitOptions } from "i18next";
import enCommon from "./locales/en/common.json";
import frCommon from "./locales/fr/common.json";

export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export const isLocale = (value: string | undefined): value is Locale =>
  locales.includes(value as Locale);

// Two small locales are bundled; switch to a fetch backend if they grow large.
export const resources = {
  en: { common: enCommon },
  fr: { common: frCommon },
} as const;

export const i18nOptions = {
  resources,
  supportedLngs: [...locales],
  fallbackLng: defaultLocale,
  defaultNS: "common",
  interpolation: { escapeValue: false },
} satisfies InitOptions;

/** Pick the right translation from a `{ en, fr }` value stored in the database. */
export function localized(text: Record<string, string> | null | undefined, locale: string) {
  if (!text) return "";
  return text[locale] ?? text[defaultLocale] ?? Object.values(text)[0] ?? "";
}
