import { Hono } from "hono";
import { deleteCookie, getCookie, getSignedCookie, setCookie, setSignedCookie } from "hono/cookie";
import * as client from "openid-client";
import { env } from "../env.ts";
import { callbackUrl, oidc } from "../oidc.ts";
import { SESSION_COOKIE, createSession, deleteSession, sessionCookieOptions } from "../session.ts";
import { upsertUserFromClaims } from "../users.ts";

// OIDC authorization code flow with PKCE against FerrisKey. The browser reaches these routes
// through the same origin as the site (/api is proxied), so the session cookie is first-party.

const LOGIN_COOKIE = "ignite_login";
const loginCookieOptions = {
  path: "/api/auth",
  httpOnly: true,
  secure: env.production,
  sameSite: "Lax" as const, // sent on the top-level redirect back from FerrisKey
  maxAge: 10 * 60,
};

type LoginState = { verifier: string; state: string; nonce: string; returnTo: string };

/** Only same-site paths, so the login flow cannot be used as an open redirect. */
function safeReturnTo(value: string | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

const SUPPORTED_UI_LOCALES = ["en", "fr"];

export const authRoutes = new Hono()
  .get("/login", async (c) => {
    const returnTo = safeReturnTo(c.req.query("returnTo"));
    const config = await oidc();
    const login: LoginState = {
      verifier: client.randomPKCECodeVerifier(),
      state: client.randomState(),
      nonce: client.randomNonce(),
      returnTo,
    };
    await setSignedCookie(c, LOGIN_COOKIE, JSON.stringify(login), env.sessionSecret, loginCookieOptions);
    const locale = returnTo.split("/")[1];
    const url = client.buildAuthorizationUrl(config, {
      redirect_uri: callbackUrl(),
      scope: "openid email profile",
      code_challenge: await client.calculatePKCECodeChallenge(login.verifier),
      code_challenge_method: "S256",
      state: login.state,
      nonce: login.nonce,
      ...(locale && SUPPORTED_UI_LOCALES.includes(locale) ? { ui_locales: locale } : {}),
    });
    return c.redirect(url.href);
  })

  .get("/callback", async (c) => {
    const raw = await getSignedCookie(c, env.sessionSecret, LOGIN_COOKIE);
    deleteCookie(c, LOGIN_COOKIE, { path: loginCookieOptions.path });
    // A missing cookie means the login took over 10 minutes or did not start in this browser.
    if (!raw) return c.redirect("/");
    const login = JSON.parse(raw) as LoginState;

    // openid-client wants the URL FerrisKey redirected to, as the browser saw it.
    const current = new URL(callbackUrl());
    current.search = new URL(c.req.url).search;
    let tokens: Awaited<ReturnType<typeof client.authorizationCodeGrant>>;
    try {
      tokens = await client.authorizationCodeGrant(await oidc(), current, {
        pkceCodeVerifier: login.verifier,
        expectedState: login.state,
        expectedNonce: login.nonce,
        idTokenExpected: true,
      });
    } catch (error) {
      console.error("sign-in failed", error);
      return c.redirect(login.returnTo);
    }
    const claims = tokens.claims()!;
    const user = await upsertUserFromClaims(claims);
    const token = await createSession(user.id, tokens.id_token);
    setCookie(c, SESSION_COOKIE, token, sessionCookieOptions());
    return c.redirect(login.returnTo);
  })

  .post("/logout", async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    const idToken = token ? await deleteSession(token) : null;
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    // RP-initiated logout so the FerrisKey session ends too; otherwise "sign in" would
    // silently sign the same person straight back in.
    const config = idToken ? await oidc().catch(() => null) : null;
    if (config?.serverMetadata().end_session_endpoint) {
      const url = client.buildEndSessionUrl(config, {
        id_token_hint: idToken!,
        post_logout_redirect_uri: `${env.appBaseUrl}/`,
      });
      return c.redirect(url.href, 303);
    }
    return c.redirect("/", 303);
  });
