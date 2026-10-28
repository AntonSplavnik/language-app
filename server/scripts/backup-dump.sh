#!/usr/bin/env bash
# The nightly backup's dump (docs/design.md §18.6): pg_dump of DATABASE_URL in custom format,
# without the data of EXCLUDED_TABLES, checked, then encrypted with age to AGE_RECIPIENT. Only the
# encrypted file is written where asked: the plain dump lives in a private temporary folder that is
# removed however the script ends. Run by .github/workflows/backup.yml, by `pnpm test:backup` and
# by hand in a rehearsal; it prints sizes and times, never the connection string.
#
#   DATABASE_URL=… AGE_RECIPIENT=age1… server/scripts/backup-dump.sh <out.dump.age>
#
# Needs PostgreSQL 17's pg_dump and pg_restore, and age, on PATH. For Neon's `sslmode=verify-full`
# libpq also needs PGSSLROOTCERT=system (the workflow sets it).
set -euo pipefail

# The tables backed up without their data (the tables themselves stay, empty after a restore): the
# dictionary, which backup:restore loads again, and the sign-ins, so a backup holds no session
# that still works. server/test/backup/backup.test.ts holds this list to the schema.
EXCLUDED_TABLES="dictionary_entries dictionary_forms auth_sessions auth_verifications auth_rate_limits"
# Data a backup must have, or it fails: the accounts, the word lists, and the migrations' record
# (without it `pnpm db:migrate` would try to rebuild a restored database).
REQUIRED_DATA="public.users public.user_words drizzle.__drizzle_migrations"

fail() {
  echo "Backup failed: $*" >&2
  exit 1
}
bytes() { wc -c <"$1" | tr -d ' '; }

out=${1:-}
[ -n "$out" ] || fail "usage: backup-dump.sh <out.dump.age>"
[ -n "${DATABASE_URL:-}" ] || fail "DATABASE_URL is not set"
case "${AGE_RECIPIENT:-}" in
age1*) ;;
*) fail "AGE_RECIPIENT is not an age public key (age1…)" ;;
esac
for tool in pg_dump pg_restore; do
  version=$("$tool" --version) || fail "$tool is not on PATH"
  case "$version" in
  *" 17."*) ;;
  *) fail "needs PostgreSQL 17's $tool, found: $version" ;;
  esac
done
age --version >/dev/null || fail "age is not on PATH"

umask 077
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
dump="$work/backup.dump"

exclusions=()
for table in $EXCLUDED_TABLES; do exclusions+=("--exclude-table-data=public.$table"); done

started=$SECONDS
pg_dump --format=custom "${exclusions[@]}" --file="$dump" --dbname="$DATABASE_URL"
echo "Dumped: $(bytes "$dump") bytes in $((SECONDS - started)) s"

# The archive's table of contents, one line per entry, such as
# `3527; 0 16424 TABLE DATA public users neondb_owner`.
contents=$(pg_restore --list "$dump")
has() { grep -Eq "^[0-9]+; [0-9]+ [0-9]+ $1 $2 $3 " <<<"$contents"; }
for table in $REQUIRED_DATA; do
  has "TABLE DATA" "${table%%.*}" "${table#*.}" || fail "the dump has no data for $table"
done
for table in $EXCLUDED_TABLES; do
  has TABLE public "$table" || fail "the dump has no table $table"
  if has "TABLE DATA" public "$table"; then fail "the dump has the data of $table"; fi
done
echo "Checked: $(grep -c ' TABLE DATA ' <<<"$contents") tables with data; none for $EXCLUDED_TABLES"

started=$SECONDS
age --encrypt --recipient "$AGE_RECIPIENT" --output "$out" "$dump"
echo "Encrypted: $(bytes "$out") bytes in $((SECONDS - started)) s"
