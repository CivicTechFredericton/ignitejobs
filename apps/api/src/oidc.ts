import * as client from "openid-client";
import { env } from "./env.ts";

let config: Promise<client.Configuration> | undefined;

/** OIDC client configuration from the issuer's discovery document, fetched once and cached. */
export function oidc(): Promise<client.Configuration> {
  const { issuer, clientId, clientSecret } = env.oidc;
  if (!issuer || !clientId || !clientSecret) {
    return Promise.reject(new Error("OIDC is not configured (OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET)"));
  }
  config ??= client
    .discovery(new URL(issuer), clientId, clientSecret, undefined, {
      // Local FerrisKey runs on plain http; production is required to use https (env.ts).
      execute: issuer.startsWith("http:") ? [client.allowInsecureRequests] : [],
    })
    .catch((error: unknown) => {
      config = undefined; // retry discovery on the next request
      throw error;
    });
  return config;
}

export const callbackUrl = () => `${env.appBaseUrl}/api/auth/callback`;
