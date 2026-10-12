import { type LoaderFunctionArgs, data } from "react-router";
import { ApiError, api } from "./api.server";

/**
 * Call the moderator API as the visitor (their session cookie is forwarded). Throws a 401
 * response for anonymous visitors and a 403 for non-moderators; the moderation layout's
 * ErrorBoundary renders sign-in or "access denied" for those.
 */
export async function modApi<T>(
  args: Pick<LoaderFunctionArgs, "request">,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  try {
    return await api<T>(`/mod${path}`, {
      method: init.method,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      request: args.request,
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
