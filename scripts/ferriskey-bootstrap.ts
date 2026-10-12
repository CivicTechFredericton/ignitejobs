// Idempotent FerrisKey setup for the job board: realm, SMTP, email template, login client.
// FerrisKey has no realm import, so this is a series of API calls that are safe to re-run.
//
//   direnv exec . pnpm auth:bootstrap            # set up / update the realm
//   direnv exec . pnpm auth:bootstrap --seed     # also create a dev moderator account
//   pnpm auth:bootstrap --print-env              # print the settings instead (e.g. in a container)
//
// Writes the login client's credentials to .env.local (git-ignored), which the API loads in
// development.
//
// FerrisKey 0.8.0 quirks handled here (see the FerrisKey spike's FINDINGS.md):
// - a missing realm answers 401 "Invalid realm", not 404;
// - re-attaching a scope or re-adding a redirect is not idempotent, so check before writing;
// - API-created clients start disabled and without PKCE;
// - SMTP settings require a username and password, even for Mailpit.

import { writeFileSync } from "node:fs";

const env = (name: string, fallback?: string) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`${name} is not set`);
  return value;
};

const ROOT = env("FERRISKEY_URL", "http://localhost:8190/api");
const REALM = env("FERRISKEY_REALM", "ignite");
const CLIENT_ID = env("FERRISKEY_CLIENT_ID", "ignite_web");
const APP_BASE_URL = env("APP_BASE_URL", "http://localhost:3000");
const seed = process.argv.includes("--seed");
const printEnv = process.argv.includes("--print-env");

type Json = Record<string, unknown>;
type Row = Json & { id: string };

async function adminToken() {
  const response = await fetch(`${ROOT}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "password",
      client_id: "admin-cli",
      username: env("FERRISKEY_ADMIN_USER", "admin"),
      password: env("FERRISKEY_ADMIN_PASSWORD", "admin"),
    }),
  });
  if (!response.ok) throw new Error(`admin login failed: ${response.status} ${await response.text()}`);
  return ((await response.json()) as { access_token: string }).access_token;
}

const token = await adminToken();

async function call(method: string, path: string, body?: unknown) {
  const response = await fetch(`${ROOT}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as unknown) : null;
  // Most responses are wrapped in {data: ...}; some are bare.
  const data = parsed && typeof parsed === "object" && "data" in parsed ? (parsed as { data: unknown }).data : parsed;
  return { status: response.status, data };
}

async function ok<T = Row>(method: string, path: string, body?: unknown): Promise<T> {
  const { status, data } = await call(method, path, body);
  if (status >= 300) throw new Error(`${method} ${path} → ${status}: ${JSON.stringify(data)}`);
  return data as T;
}

const list = (path: string) => ok<Row[]>("GET", path);
const find = (rows: Row[], key: string, value: string) => rows.find((row) => row[key] === value);

// Realm
const realmPath = `/realms/${REALM}`;
if ((await call("GET", realmPath)).status !== 200) {
  await ok("POST", "/realms", { name: REALM, display_name: "Ignite Job Board" });
  console.log(`created realm ${REALM}`);
}

// SMTP. In dev this is Mailpit, reached by its compose service name from the FerrisKey container.
await ok("PUT", `${realmPath}/smtp-config`, {
  host: env("FERRISKEY_SMTP_HOST", "mailpit"),
  port: Number(env("FERRISKEY_SMTP_PORT", "1025")),
  username: env("FERRISKEY_SMTP_USER", "ignite"),
  password: env("FERRISKEY_SMTP_PASSWORD", "ignite"),
  from_email: env("FERRISKEY_SMTP_FROM", "no-reply@ignite.local"),
  from_name: "Ignite Job Board",
  encryption: env("FERRISKEY_SMTP_ENCRYPTION", "none"),
});

// Password-reset email, in both languages. `{{var}}` is FerrisKey's template syntax.
const templates = await list(`${realmPath}/email-templates`);
const RESET_TEMPLATE = "ignite-reset-password";
const resetTemplate =
  find(templates, "name", RESET_TEMPLATE) ??
  (await ok("POST", `${realmPath}/email-templates/import`, {
    name: RESET_TEMPLATE,
    email_type: "reset_password",
    mjml: `<mjml><mj-body><mj-section><mj-column>
      <mj-text font-size="18px" font-weight="bold">Ignite Job Board</mj-text>
      <mj-text>Use this link within {{expiration}} to choose a new password:</mj-text>
      <mj-text><a href="{{reset_link}}">{{reset_link}}</a></mj-text>
      <mj-divider border-width="1px" border-color="#dddddd" />
      <mj-text>Utilisez ce lien d'ici {{expiration}} pour choisir un nouveau mot de passe :</mj-text>
      <mj-text><a href="{{reset_link}}">{{reset_link}}</a></mj-text>
      <mj-text color="#666666" font-size="12px">If you did not ask for this, ignore this email. / Si vous n'avez pas fait cette demande, ignorez ce courriel.</mj-text>
    </mj-column></mj-section></mj-body></mjml>`,
  }));

// Moderator accounts are created by an admin in the FerrisKey console; nobody signs up.
await ok("PUT", `${realmPath}/settings`, {
  user_registration_enabled: false,
  forgot_password_enabled: true,
  magic_link_enabled: false,
  reset_password_template_id: resetTemplate.id,
});

// Login client (confidential, PKCE required).
const clients = await list(`${realmPath}/clients`);
const client =
  find(clients, "client_id", CLIENT_ID) ??
  (await ok("POST", `${realmPath}/clients`, {
    name: "Ignite Job Board",
    client_id: CLIENT_ID,
    client_type: "confidential",
    public_client: false,
    service_account_enabled: false,
    enabled: true,
    protocol: "openid-connect",
  }));
await ok("PATCH", `${realmPath}/clients/${client.id}`, { enabled: true, require_pkce: true });
for (const [kind, uri] of [
  ["redirects", `${APP_BASE_URL}/api/auth/callback`],
  ["post-logout-redirects", `${APP_BASE_URL}/`],
] as const) {
  const existing = await list(`${realmPath}/clients/${client.id}/${kind}`);
  if (!find(existing, "value", uri)) {
    await ok("POST", `${realmPath}/clients/${client.id}/${kind}`, { value: uri, enabled: true });
  }
}
const { client_secret: clientSecret } = await ok<{ client_secret: string }>(
  "GET",
  `${realmPath}/clients/${client.id}/client-secret`,
);

// Dev only: a moderator to sign in with. Grant the role in our database afterwards.
const SEED_EMAIL = "moderator@ignite.local";
const SEED_PASSWORD = "Moderator-Password-1";
if (seed) {
  const users = await list(`${realmPath}/users`);
  const user =
    find(users, "username", SEED_EMAIL) ??
    (await ok("POST", `${realmPath}/users`, {
      username: SEED_EMAIL,
      email: SEED_EMAIL,
      email_verified: true,
      firstname: "Mo",
      lastname: "Derator",
    }));
  await ok("PUT", `${realmPath}/users/${user.id}/reset-password`, {
    value: SEED_PASSWORD,
    temporary: false,
    credential_type: "password",
  });
}

const issuer = `${ROOT}/realms/${REALM}`;
const settings = `OIDC_ISSUER=${issuer}\nOIDC_CLIENT_ID=${CLIENT_ID}\nOIDC_CLIENT_SECRET=${clientSecret}\nAPP_BASE_URL=${APP_BASE_URL}\n`;
if (printEnv) {
  console.log(`realm ${REALM} ready at ${issuer}. Settings for .env:\n\n${settings}`);
} else {
  writeFileSync(
    ".env.local",
    `# Written by scripts/ferriskey-bootstrap.ts; the API loads this file in development.\n${settings}`,
  );
  console.log(`realm ${REALM} ready at ${issuer}; client credentials written to .env.local`);
}
if (seed) {
  console.log(`seed user: ${SEED_EMAIL} / ${SEED_PASSWORD}`);
  console.log(`grant it moderation rights after its first sign-in: pnpm db:users grant ${SEED_EMAIL} admin`);
}
