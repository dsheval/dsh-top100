#!/usr/bin/env bash
set -euo pipefail
case "${1:-}" in
  scheduler) entry=managed-scheduler.ts ;;
  watchdog) entry=operation-watchdog.ts ;;
  *) exit 64 ;;
esac
runtime="$(dirname "${DATABASE_PATH:-runtime/dsh-top100.sqlite}")"
mkdir -p "$runtime/operations"
exec 9>"$runtime/operations/$1.lock"
flock --exclusive --nonblock --conflict-exit-code 75 9
export DSH_OPERATION_LOCK_FD=9
exec node --use-env-proxy --import tsx "collector/src/$entry"
