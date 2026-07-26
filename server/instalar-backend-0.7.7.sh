#!/usr/bin/env bash
set -euo pipefail

RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${LARMHUB_BACKEND_DIR:-/var/www/lotemobile-api}"
APP_NAME="${APP_NAME:-lotemobile-api}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$TARGET_DIR/backups/strato-0.7.7-$STAMP"

FILES=(
  "package.json"
  "src/data/system_releases_seed.js"
  "src/services/stratoReturnReportAnalyzer.js"
  "src/services/stratoMultiParcelAnalysisService.js"
  "src/services/stratoIntelligentApplyService.js"
)

for file in "${FILES[@]}"; do
  if [[ ! -f "$RELEASE_DIR/$file" ]]; then
    echo "ERRO: arquivo ausente no pacote: $file" >&2
    exit 1
  fi
  if [[ ! -f "$TARGET_DIR/$file" ]]; then
    echo "ERRO: arquivo não encontrado no backend ativo: $TARGET_DIR/$file" >&2
    exit 1
  fi
done

node --check "$RELEASE_DIR/src/data/system_releases_seed.js"
node --check "$RELEASE_DIR/src/services/stratoReturnReportAnalyzer.js"
node --check "$RELEASE_DIR/src/services/stratoMultiParcelAnalysisService.js"
node --check "$RELEASE_DIR/src/services/stratoIntelligentApplyService.js"

mkdir -p "$BACKUP_DIR/src/data" "$BACKUP_DIR/src/services"
for file in "${FILES[@]}"; do
  mkdir -p "$BACKUP_DIR/$(dirname "$file")"
  cp -a "$TARGET_DIR/$file" "$BACKUP_DIR/$file"
done

for file in "${FILES[@]}"; do
  install -m 0644 "$RELEASE_DIR/$file" "$TARGET_DIR/$file"
done

if [[ -f "$RELEASE_DIR/scripts/test_strato_0_7_7.js" ]]; then
  install -m 0644 "$RELEASE_DIR/scripts/test_strato_0_7_7.js" "$TARGET_DIR/scripts/test_strato_0_7_7.js"
fi

cd "$TARGET_DIR"
node --check src/data/system_releases_seed.js
node --check src/services/stratoReturnReportAnalyzer.js
node --check src/services/stratoMultiParcelAnalysisService.js
node --check src/services/stratoIntelligentApplyService.js
node -e "const p=require('./package.json'); if(p.version!=='0.7.7') throw new Error('package.json não ficou em 0.7.7'); console.log('Versão instalada:',p.version)"
node scripts/test_strato_0_7_7.js

if [[ -f scripts/migrate_system_releases.js ]]; then
  if ! node scripts/migrate_system_releases.js; then
    echo "ATENÇÃO: não foi possível atualizar o changelog agora. Os arquivos e o package.json já estão em 0.7.7; execute node scripts/migrate_system_releases.js depois."
  fi
fi

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env
  pm2 save >/dev/null 2>&1 || true
  pm2 describe "$APP_NAME" | sed -n '1,40p' || true
else
  echo "ATENÇÃO: PM2 não encontrado. Reinicie o backend manualmente."
fi

echo
echo "Backend 0.7.7 instalado com sucesso."
echo "Backup: $BACKUP_DIR"
echo "Não existe migration de estrutura e não execute npm install."
echo "Feche a conferência antiga e envie novamente o mesmo RET + PDF para gerar uma nova análise com as colunas corrigidas."
