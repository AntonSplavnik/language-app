#!/bin/sh
# `pnpm prod <script> [args]`: runs one of the server's scripts on production's database (Neon),
# e.g. `pnpm prod user:ai friend@example.com on`. Neon's direct connection string stays in the
# git-ignored deploy.env at the repo root (docs/design.md §18.3), so it is never typed or shown.
# DATABASE_URL points at it for this one command only; everything else keeps the Mac's database.
set -eu
cd "$(dirname "$0")/../.."

if [ $# -eq 0 ]; then
  echo "Usage: pnpm prod <script> [args], for example: pnpm prod user:list" >&2
  exit 1
fi
if [ ! -f deploy.env ]; then
  echo "No deploy.env at the repo root: see docs/commands.md, Accounts in production." >&2
  exit 1
fi

set -a
. ./deploy.env
set +a
if [ -z "${NEON_DIRECT_URL:-}" ]; then
  echo "deploy.env has no NEON_DIRECT_URL: see docs/commands.md, Accounts in production." >&2
  exit 1
fi

# Neon's console gives `sslmode=require`; the scripts check Neon's certificate (§18.5).
DATABASE_URL=$(printf '%s' "$NEON_DIRECT_URL" | sed 's/sslmode=require/sslmode=verify-full/')
export DATABASE_URL
exec pnpm --filter server "$@"
