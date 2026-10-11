import { getAuth } from "@clerk/react-router/server";
import { useTranslation } from "react-i18next";
import { redirect } from "react-router";
import { ApiError, api } from "~/lib/api.server";
import type { Posting } from "~/lib/types";
import type { Route } from "./+types/mod";

export async function loader(args: Route.LoaderArgs) {
  const { isAuthenticated, getToken } = await getAuth(args);
  if (!isAuthenticated) throw redirect(`/${args.params.lang}`);
  try {
    const pending = await api<Posting[]>("/mod/postings?status=pending", { token: await getToken() });
    return { forbidden: false, pending };
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) return { forbidden: true, pending: [] };
    throw error;
  }
}

// Phase 2 builds the review queue, manual entry and publishing UI on top of this.
export default function Moderation({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold tracking-tight">{t("mod.heading")}</h1>
      {loaderData.forbidden ? (
        <p>{t("mod.forbidden")}</p>
      ) : (
        <p>{t("mod.pending", { count: loaderData.pending.length })}</p>
      )}
    </div>
  );
}
