import i18next from "i18next";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { HydratedRouter } from "react-router/dom";
import { i18nOptions } from "./i18n";

async function hydrate() {
  // The server renders <html lang>, so the client starts in the same language.
  await i18next.use(initReactI18next).init({ ...i18nOptions, lng: document.documentElement.lang });
  startTransition(() => {
    hydrateRoot(
      document,
      <I18nextProvider i18n={i18next}>
        <StrictMode>
          <HydratedRouter />
        </StrictMode>
      </I18nextProvider>,
    );
  });
}

void hydrate();
