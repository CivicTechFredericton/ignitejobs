# Ignite Job Board

A curated, searchable, bilingual (English/French) job list for workforce development bodies.
Built for Ignite in the Fredericton Capital Region and designed so other regions can run their
own instance. See [PLAN.md](PLAN.md) for the roadmap and design decisions.

| Path | What |
|---|---|
| `apps/web` | Public site + moderator UI — React Router v8, Tailwind v4, shadcn/ui, i18next |
| `apps/api` | Hono API — public search, moderator endpoints (Clerk) |
| `packages/db` | Drizzle schema, migrations and seed data |
| `scrapers` | Python scrape workers on a Postgres-backed queue |

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

### Start the API and web app

```sh
AUTH_DEV_MODERATOR=1 direnv exec . pnpm dev
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

### Moderator access in dev

With `AUTH_DEV_MODERATOR=1`, both the API and the web app treat you as a moderator without
signing in, so http://localhost:3000/en/mod works straight away. The setting is ignored when
`NODE_ENV=production`. Without it, sign in through Clerk; with no Clerk keys configured, Clerk
runs in keyless dev mode and you can create a test account.

### Moderators and roles

Clerk only proves who someone is. Roles live in the `users` table (`roles` is a text array of
`moderator` and/or `admin`). When someone signs in, the web app calls `POST /api/session`,
which creates or refreshes their row from their Clerk profile (email, name). This repeats at
most once a day per user, tracked by a `user_synced` cookie. New users have no roles and see
"Access denied" on `/mod` until one is granted. Note that the API needs the same Clerk keys as
the web app to verify sign-ins.

```sh
direnv exec . pnpm db:users list
direnv exec . pnpm db:users grant someone@example.org moderator
direnv exec . pnpm db:users revoke someone@example.org moderator
# Bootstrap the first admin before they have visited /mod, using their Clerk user id:
direnv exec . pnpm db:users grant user_2abc... admin
```

In the Clerk dashboard, consider restricting sign-ups so only invited people can create accounts.

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

## Schema changes

Edit `packages/db/src/schema.ts`, then run `direnv exec . pnpm db:generate` and commit the
migration. The Python workers use plain SQL against the same tables.

## Deploying (single VM)

```sh
cp .env.example .env    # DATABASE_URL, Clerk keys, domain
docker-compose up -d --build
```

Postgres is not part of the stack; point `DATABASE_URL` at your instance. For a database on the
Docker host use `host.docker.internal` as the hostname. The `migrate` service applies migrations
and the seed on every `up`. Caddy terminates TLS for `SITE_DOMAIN`. Database backups are the
responsibility of whoever runs Postgres.

## Running it for another region

Copy `packages/db/src/seed/fredericton.ts` and replace the site name, region, locations and
taxonomies, then point `src/seed.ts` at the new file.
