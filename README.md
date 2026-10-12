# Ignite Job Board

A curated, searchable, bilingual (English/French) job list for workforce development bodies.
Built for Ignite in the Fredericton Capital Region and designed so other regions can run their
own instance. See [PLAN.md](PLAN.md) for the roadmap and design decisions.

| Path | What |
|---|---|
| `apps/web` | Public site + moderator UI — React Router v8, Tailwind v4, shadcn/ui, i18next |
| `apps/api` | Hono API — public search, moderator endpoints, sign-in (OIDC against FerrisKey) |
| `packages/db` | Drizzle schema, migrations and seed data |
| `scrapers` | Python scrape workers on a Postgres-backed queue |
| `e2e` | Browser tests (Playwright): sign-in through FerrisKey, emails via Mailpit |

## Running locally

Requirements: Node 24, pnpm 9, uv, direnv, and a Postgres 18 database (for `uuidv7()`).
Postgres is provisioned outside this repo. `.envrc` exports `DATABASE_URL` pointing at it, so
run anything that touches the database through `direnv exec .`. If you have run
`direnv allow`, `.envrc` loads automatically when you `cd` into the project and you can drop
the prefix.

### One-time setup

```sh
pnpm install
(cd scrapers && uv sync)
direnv exec . pnpm db:migrate   # safe to re-run
direnv exec . pnpm db:seed      # site settings, locations, industries, job types
```

### Sign-in (FerrisKey) and email (Mailpit)

Sign-in uses [FerrisKey](https://ferriskey.rs), an OIDC identity provider, and every email
(password resets) is caught by Mailpit. Both run in Docker; FerrisKey keeps its data in a
`ferriskey` database on the same Postgres server (create it once: `CREATE DATABASE ferriskey;`).

```sh
direnv exec . ./scripts/dev-infra.sh           # start FerrisKey + Mailpit (`... down` to stop)
direnv exec . pnpm auth:bootstrap --seed       # realm, SMTP, login client, a dev moderator
```

- FerrisKey admin console: http://localhost:8190 (admin / admin)
- Mailpit inbox: http://localhost:18125
- Dev moderator: `moderator@ignite.local` / `Moderator-Password-1`

The bootstrap writes the login client's credentials to `.env.local` (git-ignored). The API
loads that file by itself in development; anything already set in the environment (e.g. by
`.envrc`) takes precedence. Restart the API after re-running the bootstrap. The bootstrap is
safe to re-run; run it again after changing `APP_BASE_URL` (it registers that
origin's callback URL).

### Start the API and web app

```sh
direnv exec . pnpm dev
```

This starts the API on http://localhost:4000 and the web app on http://localhost:3000. Opening
http://localhost:3000 redirects to `/en` or `/fr` based on your language cookie or browser
language. In dev, the web server forwards `/api` requests to the API.

### Start the scraper worker (optional)

In a second terminal:

```sh
cd scrapers && direnv exec .. uv run ignite-worker
```

The worker waits for queued scrape jobs and wakes up as soon as one is added.

### Moderators and roles

FerrisKey only proves who someone is; roles live in our `users` table (`roles` is a text array
of `moderator` and/or `admin`).

1. An admin creates the person's account in the FerrisKey console (realm `ignite` → Users).
   Self-registration is off. The person sets a password with "Forgot your password?" on the
   sign-in page (the email arrives in Mailpit in dev), or the admin sets one in the console.
2. When they first sign in, the API creates their `users` row from the ID token (email, name).
   They see "Access denied" on `/mod` until a role is granted:

```sh
direnv exec . pnpm db:users list
direnv exec . pnpm db:users grant someone@example.org moderator
direnv exec . pnpm db:users revoke someone@example.org moderator
# Grant before their first sign-in using their FerrisKey user id (shown in the console):
direnv exec . pnpm db:users grant 01a1... admin
```

How sign-in works: the API runs the OIDC authorization-code flow with PKCE
(`/api/auth/login`, `/api/auth/callback`, `/api/auth/logout`), validates the ID token
(including the nonce), and keeps a server-side session (`sessions` table, 12 hours) behind an
httpOnly cookie. Only a hash of the session token is stored. Signing out also ends the
FerrisKey session.

To skip sign-in entirely while developing, start the API with `AUTH_DEV_MODERATOR=1`: every
request is then treated as an admin. It is ignored when `NODE_ENV=production`.

The moderation screens live under `/en/mod` (or `/fr/mod`):

- **Review**: approve, reject or close postings and set their location, industry and job type.
- **Sources**: add job links or careers pages to scrape, see each scrape's result, retry, and
  jump to manual entry for sites that block the scraper.
- **Add a job**: manual entry for LinkedIn, Indeed and other unscrapable sites.
- **Publish**: preview what's new or dropped since the last list, then publish a new list.

### Checks

```sh
pnpm typecheck
direnv exec . pnpm test   # API integration tests; they use DATABASE_URL and clean up after themselves
(cd scrapers && uv run pytest && uv run ruff check .)
```

Browser tests drive the real sign-in through FerrisKey and read the password-reset email from
Mailpit. They need the dev stack running (FerrisKey, Mailpit, `pnpm dev`):

```sh
(cd e2e && uv sync && uv run python -m playwright install chromium)   # once
direnv exec . sh -c 'cd e2e && uv run pytest'                          # E2E_BASE_URL defaults to :3000
```

## Schema changes

Edit `packages/db/src/schema.ts`, then run `direnv exec . pnpm db:generate` and commit the
migration. The Python workers use plain SQL against the same tables.

## Deploying (single VM)

```sh
cp .env.example .env    # database, domain, session secret, FerrisKey, SMTP
docker-compose up -d --build
docker-compose run --rm migrate pnpm auth:bootstrap --print-env
# put the printed OIDC_CLIENT_SECRET into .env, then:
docker-compose up -d
```

Postgres is not part of the stack; point `DATABASE_URL` at your instance and create a
`ferriskey` database on it for FerrisKey. For a database on the Docker host use
`host.docker.internal` as the hostname. The `migrate` service applies migrations and the seed
on every `up`. Caddy terminates TLS for `SITE_DOMAIN` and serves FerrisKey at
`auth.SITE_DOMAIN` (both need DNS records). FerrisKey runs as separate API and web images, not
the standalone image, whose bundled nginx breaks the `https` issuer behind Caddy. Database
backups are the responsibility of whoever runs Postgres.

## Running it for another region

Copy `packages/db/src/seed/fredericton.ts` and replace the site name, region, locations and
taxonomies, then point `src/seed.ts` at the new file.
