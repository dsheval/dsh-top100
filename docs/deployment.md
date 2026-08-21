# Production Deployment

## Server requirements

- Linux server with Docker Engine 24+ and Docker Compose v2.
- At least 2 CPU cores, 2 GB RAM and 5 GB free disk for the current dataset and image cache.
- A domain, reverse proxy and TLS certificate for public access.
- A GitHub token with public repository metadata and contents read access.
- Optional DeepSeek API credentials for new Chinese summaries.

## First deployment

```bash
git clone <your-repository-url> dsh-top100
cd dsh-top100
cp .env.example .env
```

Edit `.env`, then run:

```bash
./scripts/prepare-runtime.sh
docker compose up -d --build web scheduler
docker compose ps
curl --fail http://127.0.0.1:8080/
```

Keep port 8080 private when possible. Terminate HTTPS at Nginx, Caddy, Traefik or the cloud load balancer and proxy to `127.0.0.1:8080`.

## Updating the application

```bash
git pull --ff-only
docker compose up -d --build web scheduler
docker compose ps
```

Application containers are replaceable. Do not delete `runtime/` during an update.

## Migrating existing data

On the old machine:

```bash
./scripts/backup-runtime.sh
```

Copy the resulting archive to the new project root. Stop the new scheduler before restoring:

```bash
docker compose stop scheduler
tar -xzf dsh-top100-runtime-YYYYMMDD-HHMMSS.tar.gz
docker compose up -d --build web scheduler
```

The backup script stops the old scheduler while creating the archive so the SQLite file and JSON snapshots remain consistent.

## Health and logs

```bash
docker compose ps
docker compose logs --tail=200 web scheduler
curl --fail http://127.0.0.1:8080/
curl --fail http://127.0.0.1:8080/data/rankings.json
```

Docker rotates service logs automatically. Monitor disk usage for `runtime/`, `backups/` and Docker images.

## Backup policy

Run `./scripts/backup-runtime.sh` before application upgrades and on a regular schedule. Copy backups to storage outside the server. Periodically test restoring a backup on a separate machine; an untested archive is not a recovery plan.

## Security checklist

- Never commit or copy `.env` into the Web root.
- Restrict `.env` permissions to the deployment account.
- Rotate GitHub and DeepSeek credentials periodically.
- Expose only the Web port; do not expose SQLite or the scheduler container.
- Enable HTTPS and security updates on the host.
- Keep `RUN_COLLECT_ON_STARTUP=false` unless an immediate network collection is intended.
