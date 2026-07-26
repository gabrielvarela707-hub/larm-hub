#!/usr/bin/env bash
set -euo pipefail

RELEASE_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_ROOT="${LARMHUB_BACKEND_DIR:-}"
APP_NAME="${APP_NAME:-}"

# Ambiente informado pelo usuário nesta correção.
if [[ -z "$TARGET_ROOT" && -f /var/www/lotemobile-api/src/services/stratoIntelligentApplyService.js ]]; then
  TARGET_ROOT="/var/www/lotemobile-api"
fi

# Detecta qualquer processo PM2 cujo cwd contenha o serviço correto.
if [[ -z "$TARGET_ROOT" ]] && command -v pm2 >/dev/null 2>&1; then
  DETECTED="$(pm2 jlist 2>/dev/null | node -e '''
let input = "";
process.stdin.on("data", chunk => { input += chunk });
process.stdin.on("end", () => {
  try {
    const fs = require("fs");
    const apps = JSON.parse(input || "[]");
    const found = apps.find(app => {
      const cwd = app && app.pm2_env && app.pm2_env.pm_cwd || "";
      return cwd && fs.existsSync(`${cwd}/src/services/stratoIntelligentApplyService.js`);
    });
    if (found) process.stdout.write(`${found.pm2_env.pm_cwd}\n${found.name || ""}`);
  } catch (_) {}
});
''' || true)"
  TARGET_ROOT="$(printf '%s\n' "$DETECTED" | sed -n '1p')"
  [[ -n "$APP_NAME" ]] || APP_NAME="$(printf '%s\n' "$DETECTED" | sed -n '2p')"
fi

if [[ -z "$TARGET_ROOT" ]]; then
  echo "ERRO: backend ativo não localizado." >&2
  echo "Execute: LARMHUB_BACKEND_DIR=/var/www/lotemobile-api APP_NAME=lotemobile-api bash instalar-0.7.3.sh" >&2
  exit 1
fi

[[ -n "$APP_NAME" ]] || APP_NAME="lotemobile-api"
TARGET_SERVICE="$TARGET_ROOT/src/services/stratoIntelligentApplyService.js"
[[ -f "$TARGET_SERVICE" ]] || { echo "ERRO: serviço não encontrado em $TARGET_SERVICE" >&2; exit 1; }

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$TARGET_ROOT/backups/strato-0.7.3-$STAMP"
mkdir -p "$BACKUP/src/services" "$BACKUP/src/data"
cp -a "$TARGET_SERVICE" "$BACKUP/src/services/"
[[ -f "$TARGET_ROOT/src/data/system_releases_seed.js" ]] && cp -a "$TARGET_ROOT/src/data/system_releases_seed.js" "$BACKUP/src/data/"
[[ -f "$TARGET_ROOT/package.json" ]] && cp -a "$TARGET_ROOT/package.json" "$BACKUP/"
[[ -f "$TARGET_ROOT/package-lock.json" ]] && cp -a "$TARGET_ROOT/package-lock.json" "$BACKUP/"

cp -f "$RELEASE_DIR/src/services/stratoIntelligentApplyService.js" "$TARGET_SERVICE"
cp -f "$RELEASE_DIR/src/data/system_releases_seed.js" "$TARGET_ROOT/src/data/system_releases_seed.js"
cp -f "$RELEASE_DIR/package.json" "$TARGET_ROOT/package.json"
cp -f "$RELEASE_DIR/package-lock.json" "$TARGET_ROOT/package-lock.json"

node -c "$TARGET_SERVICE"
cd "$TARGET_ROOT"
node - <<'NODE'
const service = require('./src/services/stratoIntelligentApplyService')
const rows = service.getAnalysisItems({ itens: [{ linha: 3 }, { linha: 12 }] })
if (rows.length !== 2 || rows[0].linha !== 3 || rows[1].linha !== 12) {
  throw new Error('Falha: backend ainda não está lendo analysis.itens.')
}
console.log('VALIDADO: analysis.itens contém as linhas 3 e 12 e será percorrido na aplicação.')
NODE

if [[ "${SKIP_PM2:-0}" == "1" ]]; then
  echo "PM2 não reiniciado porque SKIP_PM2=1."
elif command -v pm2 >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env
  sleep 2
  pm2 show "$APP_NAME" | sed -n '1,35p'
else
  echo "AVISO: PM2 não encontrado; reinicie a API manualmente."
fi

echo
echo "INSTALAÇÃO 0.7.3 CONCLUÍDA"
echo "Backend: $TARGET_ROOT"
echo "Processo: $APP_NAME"
echo "Backup: $BACKUP"
echo "Correção aplicada: analysis.itens (real) com fallback para analysis.items."
