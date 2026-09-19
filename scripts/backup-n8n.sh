#!/usr/bin/env bash
#
# Sao lưu mọi thứ cần thiết để dựng lại n8n từ con số không:
#   - toàn bộ workflow, mỗi cái một file JSON
#   - toàn bộ credential, vẫn ở dạng mã hoá
#   - cơ sở dữ liệu Postgres (lịch sử chạy, cấu hình, bản ghi credential)
#
# Credential được xuất ở dạng ĐÃ MÃ HOÁ. Không có N8N_ENCRYPTION_KEY trong .env thì
# không giải mã được. Khoá đó không nằm trong repo và cũng không nằm trong bản sao lưu.
# Hãy cất khoá ở nơi khác với thư mục sao lưu, nếu không bản sao lưu là vô dụng.
#
# Dùng:  ./scripts/backup-n8n.sh [thư-mục-sao-lưu]
# Cron:  0 2 * * *  cd /đường/dẫn/repo && ./scripts/backup-n8n.sh >> /var/log/n8n-backup.log 2>&1

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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

echo "[1/4] Xuất workflow..."
docker compose exec -T n8n n8n export:workflow --all --separate --output=/tmp/n8n-backup/workflows
docker compose cp n8n:/tmp/n8n-backup/workflows/. "$DEST/workflows/"

echo "[2/4] Xuất credential (đã mã hoá)..."
docker compose exec -T n8n n8n export:credentials --all --output=/tmp/n8n-backup/credentials.json
docker compose cp n8n:/tmp/n8n-backup/credentials.json "$DEST/credentials.json"

echo "[3/4] Dump Postgres..."
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:?Chưa đặt POSTGRES_USER}" \
  "${POSTGRES_DB:?Chưa đặt POSTGRES_DB}" | gzip > "$DEST/postgres.sql.gz"

docker compose exec -T n8n rm -rf /tmp/n8n-backup

cat > "$DEST/RESTORE.md" <<EOF
# Khôi phục bản sao lưu ngày $STAMP

1. Dựng stack sạch: \`docker compose up -d\`
2. Đặt ĐÚNG N8N_ENCRYPTION_KEY đang dùng vào ngày $STAMP vào .env rồi khởi động lại.
   Không có khoá đó thì mọi credential trong credentials.json không giải mã được.
3. Khôi phục cơ sở dữ liệu:
   gunzip -c postgres.sql.gz | docker compose exec -T postgres psql -U \$POSTGRES_USER \$POSTGRES_DB
4. Hoặc, nếu chỉ muốn khôi phục workflow chứ không cần lịch sử chạy:
   docker compose cp workflows n8n:/tmp/restore
   docker compose exec -T n8n n8n import:workflow --separate --input=/tmp/restore
   docker compose cp credentials.json n8n:/tmp/credentials.json
   docker compose exec -T n8n n8n import:credentials --input=/tmp/credentials.json
5. Mọi workflow nhập vào đều ở trạng thái tắt. Bật lại từng cái một, có chủ đích.
EOF

echo "[4/4] Xoá bản sao lưu cũ hơn $KEEP_DAYS ngày..."
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime "+$KEEP_DAYS" -exec rm -rf {} +

echo "Xong: $DEST"
