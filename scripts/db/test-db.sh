#!/usr/bin/env bash
# Local Postgres harness for migration + RLS integration tests.
#   scripts/db/test-db.sh start   # init (once) and start a throwaway cluster on $TEST_DB_PORT
#   scripts/db/test-db.sh reset   # drop/recreate the database, apply shim + migrations (+ dev seed with --seed)
#   scripts/db/test-db.sh stop
# Requires PostgreSQL 15+ server binaries (initdb, pg_ctl). Set PG_BIN if they are not on PATH.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl 2>/dev/null || echo /usr/lib/postgresql/16/bin/pg_ctl)")}"
PORT="${TEST_DB_PORT:-54329}"
DATA="${TEST_DB_DIR:-$ROOT/.tmp/pgdata}"
DB="${TEST_DB_NAME:-satmaster_test}"
RUN_AS=""
if [ "$(id -u)" = "0" ]; then RUN_AS="runuser -u ${TEST_DB_OS_USER:-claude} --"; fi

pg() { $RUN_AS "$PG_BIN/$1" "${@:2}"; }
psql_db() { psql -v ON_ERROR_STOP=1 -q -h 127.0.0.1 -p "$PORT" -U postgres "$@"; }

case "${1:-}" in
  start)
    mkdir -p "$(dirname "$DATA")"
    if [ -n "$RUN_AS" ]; then chown -R "${TEST_DB_OS_USER:-claude}" "$(dirname "$DATA")"; fi
    if [ ! -f "$DATA/PG_VERSION" ]; then
      pg initdb -D "$DATA" -U postgres --auth=trust >/dev/null
    fi
    if ! pg pg_ctl -D "$DATA" status >/dev/null 2>&1; then
      pg pg_ctl -D "$DATA" -o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1" -l "$DATA/server.log" -w start >/dev/null
    fi
    echo "postgres running on 127.0.0.1:$PORT"
    ;;
  reset)
    psql_db -d postgres -c "drop database if exists $DB with (force)" -c "create database $DB"
    psql_db -d "$DB" -f "$ROOT/scripts/db/supabase-shim.sql"
    for f in "$ROOT"/supabase/migrations/*.sql; do
      if ! out=$(psql_db -d "$DB" -f "$f" 2>&1); then
        echo "$out" | grep -v NOTICE >&2
        echo "MIGRATION FAILED: $(basename "$f")" >&2
        exit 1
      fi
    done
    if [ "${2:-}" = "--seed" ]; then
      psql_db -d "$DB" -f "$ROOT/supabase/seed/dev_seed.sql"
    fi
    echo "database $DB ready (postgres://postgres@127.0.0.1:$PORT/$DB)"
    ;;
  stop)
    pg pg_ctl -D "$DATA" -w stop >/dev/null || true
    ;;
  *)
    echo "usage: $0 start|reset [--seed]|stop" >&2; exit 1 ;;
esac
