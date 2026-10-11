import { redirect } from "react-router";
import { getLocale } from "~/middleware/i18next";
import type { Route } from "./+types/locale-redirect";

export function loader({ context }: Route.LoaderArgs) {
  return redirect(`/${getLocale(context)}`);
}
