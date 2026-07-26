#!/usr/bin/env bash
set -euo pipefail

RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${LARMHUB_BACKEND_DIR:-/var/www/lotemobile-api}"
APP_NAME="${APP_NAME:-lotemobile-api}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$TARGET_DIR/backups/strato-0.7.9-$STAMP"

FILES=(
  "package.json"
  "src/data/system_releases_seed.js"
  "src/services/stratoIntelligentApplyService.js"
)

for file in "${FILES[@]}"; do
  [[ -f "$RELEASE_DIR/$file" ]] || { echo "ERRO: arquivo ausente no pacote: $file" >&2; exit 1; }
  [[ -f "$TARGET_DIR/$file" ]] || { echo "ERRO: arquivo ausente no backend ativo: $TARGET_DIR/$file" >&2; exit 1; }
done

node --check "$RELEASE_DIR/src/data/system_releases_seed.js"
node --check "$RELEASE_DIR/src/services/stratoIntelligentApplyService.js"
node "$RELEASE_DIR/scripts/test_strato_0_7_9.js"

mkdir -p "$BACKUP_DIR"
for file in "${FILES[@]}"; do
  mkdir -p "$BACKUP_DIR/$(dirname "$file")"
  cp -a "$TARGET_DIR/$file" "$BACKUP_DIR/$file"
  install -D -m 0644 "$RELEASE_DIR/$file" "$TARGET_DIR/$file"
done

install -D -m 0644 "$RELEASE_DIR/scripts/test_strato_0_7_9.js" "$TARGET_DIR/scripts/test_strato_0_7_9.js"

cd "$TARGET_DIR"
node --check src/data/system_releases_seed.js
node --check src/services/stratoIntelligentApplyService.js
node -e "const p=require('./package.json'); if(p.version!=='0.7.9') throw new Error('package.json não ficou em 0.7.9'); console.log('Versão instalada:', p.version)"
node scripts/test_strato_0_7_9.js

if [[ -f scripts/migrate_system_releases.js ]]; then
  node scripts/migrate_system_releases.js
fi

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env
  pm2 save >/dev/null 2>&1 || true
else
  echo "ATENÇÃO: PM2 não encontrado. Reinicie o backend manualmente."
fi

echo
echo "Backend 0.7.9 instalado com sucesso."
echo "Backup: $BACKUP_DIR"
echo "O frontend permanece em 0.7.8."
echo "Sem migration e sem npm install."
