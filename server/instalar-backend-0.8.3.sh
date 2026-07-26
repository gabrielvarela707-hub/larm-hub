#!/usr/bin/env bash
set -euo pipefail

RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${LARMHUB_BACKEND_DIR:-/var/www/lotemobile-api}"
APP_NAME="${APP_NAME:-lotemobile-api}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$BACKEND_DIR/backups/0.8.3-$STAMP"

if [[ ! -d "$BACKEND_DIR" ]]; then
  echo "Backend não encontrado: $BACKEND_DIR" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR" "$BACKEND_DIR/scripts/imports" "$BACKEND_DIR/src/data"

for target in \
  package.json \
  src/data/system_releases_seed.js \
  scripts/sync_strato_snapshot_cadastros.js \
  scripts/imports/strato_snapshot_2026_07_25.csv; do
  if [[ -f "$BACKEND_DIR/$target" ]]; then
    mkdir -p "$BACKUP_DIR/$(dirname "$target")"
    cp -a "$BACKEND_DIR/$target" "$BACKUP_DIR/$target"
  fi
done

cp -a "$RELEASE_DIR/package.json" "$BACKEND_DIR/package.json"
cp -a "$RELEASE_DIR/src/data/system_releases_seed.js" "$BACKEND_DIR/src/data/system_releases_seed.js"
cp -a "$RELEASE_DIR/scripts/sync_strato_snapshot_cadastros.js" "$BACKEND_DIR/scripts/sync_strato_snapshot_cadastros.js"
cp -a "$RELEASE_DIR/scripts/imports/strato_snapshot_2026_07_25.csv" "$BACKEND_DIR/scripts/imports/strato_snapshot_2026_07_25.csv"

cd "$BACKEND_DIR"
node --check scripts/sync_strato_snapshot_cadastros.js
node - <<'NODE'
const { parseSnapshot } = require('./scripts/sync_strato_snapshot_cadastros')
const result = parseSnapshot('./scripts/imports/strato_snapshot_2026_07_25.csv')
const expected = { linhas: 61229, clientes: 588, contratos: 709, parcelas: 59932 }
for (const [key, value] of Object.entries(expected)) {
  if (result.totals[key] !== value) {
    throw new Error(`Snapshot inválido em ${key}: ${result.totals[key]} != ${value}`)
  }
}
if (result.clients.size !== 578 || result.contracts.size !== 709) {
  throw new Error(`Totais únicos inesperados: clientes=${result.clients.size}, contratos=${result.contracts.size}`)
}
console.log('Snapshot validado: 61.229 linhas, 578 clientes únicos e 709 contratos.')
NODE

node scripts/migrate_system_releases.js
pm2 restart "$APP_NAME" --update-env
pm2 save >/dev/null 2>&1 || true

echo
echo "Backend instalado em: $BACKEND_DIR"
echo "Backup criado em: $BACKUP_DIR"
echo "Versão: $(node -p "require('./package.json').version")"
echo
echo "Execute primeiro a prévia:"
echo "  cd $BACKEND_DIR && npm run db:preview:strato-cadastros"
echo
echo "Depois, para gravar:"
echo "  cd $BACKEND_DIR && npm run db:sync:strato-cadastros"
