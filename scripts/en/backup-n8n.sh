#!/usr/bin/env bash
#
# Backs up everything needed to rebuild this n8n instance from nothing:
#   - every workflow, as separate JSON files
#   - every credential, still encrypted
#   - the Postgres database (executions, settings, credential rows)
#
# Credentials are exported ENCRYPTED. They are worthless without N8N_ENCRYPTION_KEY
# from .env, which is not in this repo and is not in the backup either. Store that key
# somewhere separate from these backups, or the backups cannot be restored.
#
# Usage:  ./scripts/en/backup-n8n.sh [backup-root]
# Cron:   0 2 * * *  cd /path/to/repo && ./scripts/en/backup-n8n.sh >> /var/log/n8n-backup.log 2>&1

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_DIR="$REPO_ROOT/n8n-local"
BACKUP_ROOT="${1:-$REPO_ROOT/backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
STAMP="$(date +%Y-%m-%d_%H%M)"
DEST="$BACKUP_ROOT/$STAMP"

cd "$COMPOSE_DIR"

if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$REPO_ROOT/.env"
  set +a
fi

mkdir -p "$DEST/workflows"

echo "[1/4] Exporting workflows..."
docker compose exec -T n8n n8n export:workflow --all --separate --output=/tmp/n8n-backup/workflows
docker compose cp n8n:/tmp/n8n-backup/workflows/. "$DEST/workflows/"

echo "[2/4] Exporting credentials (encrypted)..."
docker compose exec -T n8n n8n export:credentials --all --output=/tmp/n8n-backup/credentials.json
docker compose cp n8n:/tmp/n8n-backup/credentials.json "$DEST/credentials.json"

echo "[3/4] Dumping Postgres..."
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:?POSTGRES_USER not set}" \
  "${POSTGRES_DB:?POSTGRES_DB not set}" | gzip > "$DEST/postgres.sql.gz"

docker compose exec -T n8n rm -rf /tmp/n8n-backup

cat > "$DEST/RESTORE.md" <<EOF
# Restoring the backup taken on $STAMP

1. Bring up a clean stack: \`docker compose up -d\`
2. Put the SAME N8N_ENCRYPTION_KEY that was live on $STAMP into .env, then restart.
   Without it every credential in credentials.json is undecryptable.
3. Restore the database:
   gunzip -c postgres.sql.gz | docker compose exec -T postgres psql -U \$POSTGRES_USER \$POSTGRES_DB
4. Or, to restore only the automation rather than the execution history:
   docker compose cp workflows n8n:/tmp/restore
   docker compose exec -T n8n n8n import:workflow --separate --input=/tmp/restore
   docker compose cp credentials.json n8n:/tmp/credentials.json
   docker compose exec -T n8n n8n import:credentials --input=/tmp/credentials.json
5. All workflows import inactive. Re-activate them deliberately, one at a time.
EOF

echo "[4/4] Pruning backups older than $KEEP_DAYS days..."
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime "+$KEEP_DAYS" -exec rm -rf {} +

echo "Done: $DEST"
