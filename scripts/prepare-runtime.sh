#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
mkdir -p "$project_dir/runtime/collector-data" "$project_dir/runtime/public-data"

if [ ! -f "$project_dir/runtime/collector-data/plugins.json" ]; then
  cp "$project_dir/data/plugins.json" "$project_dir/runtime/collector-data/plugins.json"
fi

if [ -f "$project_dir/data/zh-cache.json" ] && [ ! -f "$project_dir/runtime/collector-data/zh-cache.json" ]; then
  cp "$project_dir/data/zh-cache.json" "$project_dir/runtime/collector-data/zh-cache.json"
fi

echo "Runtime directories are ready: $project_dir/runtime"
