import { getAuth } from "@clerk/react-router/server";
import { type LoaderFunctionArgs, data } from "react-router";
import { ApiError, api } from "./api.server";

/**
 * Local development without Clerk: act as a moderator. Mirrors the API's AUTH_DEV_MODERATOR and,
 * like it, is ignored in production builds.
 */
export const devModerator = process.env.NODE_ENV !== "production" && process.env.AUTH_DEV_MODERATOR === "1";

/**
 * Call the moderator API as the signed-in Clerk user. Throws a 401 response for anonymous users
 * and a 403 for non-moderators; the moderation layout's ErrorBoundary renders sign-in or
 * "access denied" for those.
 */
export async function modApi<T>(
  args: Pick<LoaderFunctionArgs, "request" | "params" | "context">,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  let token: string | null = null;
  if (!devModerator) {
    const { isAuthenticated, getToken } = await getAuth(args as LoaderFunctionArgs);
    if (!isAuthenticated) throw data("unauthenticated", { status: 401 });
    token = await getToken();
  }
  try {
    return await api<T>(`/mod${path}`, {
      method: init.method,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      token,
    });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      throw data(error.code, { status: error.status });
    }
    throw error;
  }
}

/** Form values arrive as strings; empty selects and inputs mean "not set". */
export function formValue(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** Turn an API failure into something an action can return to its form. */
export function actionError(error: unknown) {
  if (error instanceof ApiError && error.status < 500) {
    return { ok: false as const, error: error.code, fields: error.fields };
  }
  throw error;
}
