import { getAuth } from "@clerk/react-router/server";
import { type LoaderFunctionArgs, type MiddlewareFunction, createCookie } from "react-router";
import { api } from "~/lib/api.server";
import { devModerator } from "~/lib/mod.server";

// Remembers which Clerk user was last synced so we call the API once a day, not on every
// request. It only gates the sync, so it needs no signing: tampering just causes a re-sync.
const syncedCookie = createCookie("user_synced", {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24,
});

/**
 * When a signed-in user makes a request, make sure they have a row in the users table (created
 * or refreshed from their Clerk profile by POST /api/session). Must run after clerkMiddleware.
 */
export const userSyncMiddleware: MiddlewareFunction<Response> = async (args, next) => {
  if (devModerator) return next();

  const auth = await getAuth(args as LoaderFunctionArgs).catch(() => null);
  if (!auth?.userId) return next();
  if ((await syncedCookie.parse(args.request.headers.get("Cookie"))) === auth.userId) return next();

  try {
    await api("/session", { method: "POST", token: await auth.getToken() });
  } catch (error) {
    // Never break a page over this; we try again on the next request.
    console.error("user sync failed", error);
    return next();
  }

  const response = await next();
  response.headers.append("Set-Cookie", await syncedCookie.serialize(auth.userId));
  return response;
};
