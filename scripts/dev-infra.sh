#!/bin/sh
# Start (or stop, with `down`) the local FerrisKey + Mailpit stack, pointing FerrisKey at the
# `ferriskey` database on the Postgres server from DATABASE_URL.
#   direnv exec . ./scripts/dev-infra.sh          # start
#   direnv exec . ./scripts/dev-infra.sh down     # stop
set -eu
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?DATABASE_URL is not set; run via: direnv exec . ./scripts/dev-infra.sh}"
eval "$(node -e '
  const u = new URL(process.env.DATABASE_URL);
  const host = ["localhost", "127.0.0.1"].includes(u.hostname) ? "host.docker.internal" : u.hostname;
  const q = (s) => "\x27" + decodeURIComponent(s).replaceAll("\x27", "\x27\\\x27\x27") + "\x27";
  console.log(`export FERRISKEY_DB_HOST=${q(host)} FERRISKEY_DB_PORT=${q(u.port || "5432")} FERRISKEY_DB_USER=${q(u.username)} FERRISKEY_DB_PASSWORD=${q(u.password)}`);
')"
[ $# -eq 0 ] && set -- up -d
exec docker-compose -f compose.dev.yaml -p ignite-dev "$@"
