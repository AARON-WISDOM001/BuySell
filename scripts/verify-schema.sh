#!/usr/bin/env bash
# Applies the Supabase migrations to a throwaway local Postgres and runs the
# schema/RLS integration checks. Verifies the security-critical SQL against a
# real database instead of trusting it compiles.
#
# Usage: scripts/verify-schema.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGDATA="$(mktemp -d)/pgdata"
PGPORT="${PGPORT:-55432}"
SOCKET_DIR="$(mktemp -d)"

cleanup() {
  pg_ctl -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$(dirname "$PGDATA")" "$SOCKET_DIR"
}
trap cleanup EXIT

echo "==> starting throwaway postgres on port $PGPORT"
initdb -D "$PGDATA" -U postgres --auth=trust >/dev/null 2>&1
pg_ctl -D "$PGDATA" -o "-p $PGPORT -k $SOCKET_DIR -c listen_addresses=''" \
  -l "$PGDATA/server.log" start >/dev/null

psql_q() { psql -h "$SOCKET_DIR" -p "$PGPORT" -U postgres -d postgres -q -v ON_ERROR_STOP=1 "$@"; }

echo "==> applying auth stub"
psql_q -f "$ROOT/supabase/tests/0000_auth_stub.sql" >/dev/null

echo "==> applying migrations"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "    $(basename "$f")"
  psql_q -f "$f" >/dev/null
done

echo "==> applying seed catalogue (proves the seed SQL is valid too)"
psql_q -f "$ROOT/supabase/seed.sql" >/dev/null
psql_q -t -c "select count(*) from public.products" | tr -d ' ' | grep -qx '12' \
  || { echo "FAIL: expected 12 seeded products"; exit 1; }
psql_q -t -c "select count(*) from public.categories" | tr -d ' ' | grep -qx '4' \
  || { echo "FAIL: expected 4 seeded categories"; exit 1; }
echo "    12 products, 4 categories"

echo "==> re-applying seed (must be idempotent)"
psql_q -f "$ROOT/supabase/seed.sql" >/dev/null
psql_q -t -c "select count(*) from public.products" | tr -d ' ' | grep -qx '12' \
  || { echo "FAIL: re-running the seed duplicated rows"; exit 1; }

echo "==> running schema + RLS integration checks"
psql_q -f "$ROOT/supabase/tests/schema_test.sql"