#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
backup_dir=${1:-"$project_dir/backups"}
timestamp=$(date +%Y%m%d-%H%M%S)
archive="$backup_dir/dsh-top100-runtime-$timestamp.tar.gz"

mkdir -p "$backup_dir"
docker compose -f "$project_dir/docker-compose.yml" stop scheduler >/dev/null 2>&1 || true
tar -C "$project_dir" -czf "$archive" runtime
docker compose -f "$project_dir/docker-compose.yml" start scheduler >/dev/null 2>&1 || true

echo "$archive"
