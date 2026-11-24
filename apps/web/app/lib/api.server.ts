// Calls from loaders/actions to the Hono API. It runs in this same process (server/app.ts
// mounts it at /api), so app.request() dispatches without going over the network.
import { app } from "@ignite/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    /** For "invalid_input": the names of the fields that failed validation. */
    public fields: string[] = [],
  ) {
    super(`API ${status}: ${code}`);
  }
}

export async function api<T>(
  path: string,
  init: RequestInit & { request?: Request } = {},
): Promise<T> {
  const { request, ...rest } = init;
  const headers = new Headers(rest.headers);
  // The session lives in the API's httpOnly cookie; pass the visitor's cookie through.
  const cookie = request?.headers.get("Cookie");
  if (cookie) headers.set("Cookie", cookie);
  if (rest.body) headers.set("Content-Type", "application/json");
  const response = await app.request(`/api${path}`, { ...rest, headers });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string; fields?: string[] };
    throw new ApiError(response.status, body.error ?? "unknown_error", body.fields);
  }
  return response.json() as Promise<T>;
}
