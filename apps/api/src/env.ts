import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const production = process.env.NODE_ENV === "production";

// In development, pick up the OIDC client settings that `pnpm auth:bootstrap` writes to the repo
// root's .env.local. Variables already in the environment (direnv, docker-compose) win.
const envLocal = fileURLToPath(new URL("../../../.env.local", import.meta.url));
if (!production && existsSync(envLocal)) process.loadEnvFile(envLocal);

export const env = {
  port: Number(process.env.PORT ?? 4000),
  production,
  // Local development without an identity provider: treat every request as a moderator.
  devModerator: !production && process.env.AUTH_DEV_MODERATOR === "1",
  /** Public URL of the site; the OIDC redirect URIs registered in FerrisKey hang off it. */
  appBaseUrl: (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  oidc: {
    issuer: process.env.OIDC_ISSUER,
    clientId: process.env.OIDC_CLIENT_ID,
    clientSecret: process.env.OIDC_CLIENT_SECRET,
  },
  /** Signs the short-lived login-state cookie. */
  sessionSecret: process.env.SESSION_SECRET ?? (production ? "" : "dev-only-session-secret"),
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 12),
};

export function assertProductionConfig() {
  if (!production) return;
  const missing = [
    ["OIDC_ISSUER", env.oidc.issuer],
    ["OIDC_CLIENT_ID", env.oidc.clientId],
    ["OIDC_CLIENT_SECRET", env.oidc.clientSecret],
    ["SESSION_SECRET", env.sessionSecret],
    ["APP_BASE_URL", process.env.APP_BASE_URL],
  ].filter(([, value]) => !value);
  if (missing.length) throw new Error(`Missing configuration: ${missing.map(([name]) => name).join(", ")}`);
  if (env.oidc.issuer?.startsWith("http:")) throw new Error("OIDC_ISSUER must use https in production");
}
