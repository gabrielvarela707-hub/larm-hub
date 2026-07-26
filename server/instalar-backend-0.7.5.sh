#!/usr/bin/env bash
set -euo pipefail

RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${LARMHUB_BACKEND_DIR:-/var/www/lotemobile-api}"
APP_NAME="${APP_NAME:-lotemobile-api}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$TARGET_DIR/backups/recebimento-avulso-strato-$STAMP"

for file in package.json src/routes/recebiveis.js src/data/system_releases_seed.js; do
  if [[ ! -f "$RELEASE_DIR/$file" ]]; then
    echo "ERRO: arquivo do pacote ausente: $file" >&2
    exit 1
  fi
  if [[ ! -f "$TARGET_DIR/$file" ]]; then
    echo "ERRO: destino não parece ser o backend LarmHub: $TARGET_DIR/$file não existe" >&2
    exit 1
  fi
done

node --check "$RELEASE_DIR/src/routes/recebiveis.js"
mkdir -p "$BACKUP_DIR/src/routes" "$BACKUP_DIR/src/data"
cp -a "$TARGET_DIR/package.json" "$BACKUP_DIR/package.json"
cp -a "$TARGET_DIR/src/routes/recebiveis.js" "$BACKUP_DIR/src/routes/recebiveis.js"
cp -a "$TARGET_DIR/src/data/system_releases_seed.js" "$BACKUP_DIR/src/data/system_releases_seed.js"

install -m 0644 "$RELEASE_DIR/package.json" "$TARGET_DIR/package.json"
install -m 0644 "$RELEASE_DIR/src/routes/recebiveis.js" "$TARGET_DIR/src/routes/recebiveis.js"
install -m 0644 "$RELEASE_DIR/src/data/system_releases_seed.js" "$TARGET_DIR/src/data/system_releases_seed.js"
node --check "$TARGET_DIR/src/routes/recebiveis.js"

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env
else
  echo "ATENÇÃO: pm2 não encontrado. Reinicie manualmente o backend."
fi

echo "Backend 0.7.5 instalado. Backup: $BACKUP_DIR"
echo "Sem migration e sem npm install."
