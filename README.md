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

- `AUTH_DEV_MODERATOR=1` makes the API treat every request as coming from a moderator. The
  setting is ignored when `NODE_ENV=production`.
- Without Clerk keys, the web app runs in Clerk's keyless dev mode. To open `/en/mod`, click
  "Moderator sign in" and create a test account.
- In production, moderators are Clerk users with `publicMetadata.role` set to `moderator` or
  `admin`. Add `{"metadata": "{{user.public_metadata}}"}` to the Clerk session token template.

There are no moderation screens yet (phase 2), so call the API directly:

```sh
# Add a source to scrape (queues a job for the worker)
curl -X POST localhost:4000/api/mod/sources -H 'content-type: application/json' \
  -d '{"url":"https://example.wd3.myworkdayjobs.com/en-US/careers/job/123","kind":"posting"}'

# Review queue
curl 'localhost:4000/api/mod/postings?status=pending'

# Approve a posting
curl -X PATCH localhost:4000/api/mod/postings/<id> -H 'content-type: application/json' \
  -d '{"status":"approved"}'

# Publish a list: every approved posting, flagged "new" if it wasn't in the previous list
curl -X POST localhost:4000/api/mod/editions -H 'content-type: application/json' \
  -d '{"title":{"en":"Job list — October 2026","fr":"Liste d’emplois — octobre 2026"}}'
```

### Checks

```sh
pnpm typecheck
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
