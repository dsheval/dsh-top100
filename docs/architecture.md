# Architecture

## Overview

dsh-Top100 separates collection, persistence, publication and presentation so a failed network update cannot leave the public site with partial data.

```text
GitHub Search / Code Search / npm / curated lists
                       │
                       ▼
              Candidate discovery
                       │
                       ▼
       Deterministic plugin verification
                       │
             README / SKILL.md metadata
                       │
                       ▼
        Optional DeepSeek Chinese summary
                       │
                       ▼
        SQLite state and daily snapshots
                       │
                       ▼
          Atomic public JSON snapshots
                       │
                       ▼
                Nginx static site
```

## Components

### Collector

`collector/` is a TypeScript workspace. It discovers candidates from configuration in `collector/config/discovery-sources.json`, verifies repository markers, reads metadata, maintains the Chinese-summary cache and emits a normalized market snapshot.

Daily mode reads bounded high-value search windows and refreshes known repositories. Weekly full mode recursively partitions GitHub repository searches so a single 1,000-result API window does not silently define the catalog.

### Database and publisher

`collector/src/database.ts` owns SQLite schema creation and snapshot imports. The main tables are:

- `repositories`: latest normalized repository state.
- `repository_daily_stats`: Stars by repository and date.
- `repository_summaries`: generated Chinese descriptions and model metadata.
- `collection_runs`: collection and import audit records.

`collector/src/sync-database.ts` imports the latest collector output, builds rankings and publishes JSON through temporary files followed by atomic renames.

### Scheduler

`collector/src/scheduler.ts` is a long-running process inside the scheduler container. On startup it republishes the existing snapshot unless `RUN_COLLECT_ON_STARTUP=true`. At the configured Beijing-time hour it runs one update; the configured weekday selects full discovery.

### Web

`web/public/` is a static HTML/CSS/JavaScript application. It reads `/data/rankings.json`; it never connects to GitHub, DeepSeek or SQLite and never receives a secret.

### DSH plugin

`plugin/` is an independently publishable DeepSeek Harness workspace. Its Host process fetches and caches the same published `rankings.json` used by the website, exposes local same-origin APIs, reads the active DSH Profile and performs validated installs. Its Client bundle adds the rankings page to DSH Settings. The package also registers the bundled `recommend-dsh-plugins` Skill and the read-only `dsh_top100_search` model tool into DSH's global registries; both disappear with the plugin and never copy files into the user's Skill directory.

Website and plugin search use the same weighted search core in `plugin/src/shared/search.ts`. The Host imports it directly; `npm run search:build` bundles the same source to `web/public/search-engine.js`. Search weights exact names and repository identifiers above tags, topics and descriptions, expands Chinese/English synonyms, removes natural-language filler, tolerates one edit or adjacent transposition in longer Latin tokens, and orders matches by relevance while retaining the published rank on each item.

The plugin package does not contain the Collector, SQLite database or website backend. `plugin/src/host`, `plugin/src/install`, `plugin/src/client` and `plugin/src/shared` keep host integration, local mutations, UI code and cross-runtime contracts separate.

## Persistence

All mutable deployment state lives under `runtime/`:

```text
runtime/
├── dsh-top100.sqlite
├── collector-data/
│   ├── plugins.json
│   ├── zh-cache.json
│   └── cache/
└── public-data/
    ├── rankings.json
    ├── rankings-hot.json
    ├── rankings-rising.json
    ├── rankings-total.json
    └── plugins.json
```

This directory is bind-mounted into Docker and excluded from Git. Copying a consistent `runtime/` directory migrates the complete database, ranking history and caches.

## Failure behavior

- Discovery and model failures do not expose secrets to the frontend.
- Invalid model output is rejected before persistence.
- Public JSON is atomically replaced, so readers see either the previous complete snapshot or the new complete snapshot.
- Docker logs rotate at 10 MB with three files per service.
- Nginx exposes only static application files and `runtime/public-data/`.
