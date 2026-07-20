LarmHub API — Versionador 0.3.96

Atualiza apenas o changelog/versionador do sistema para registrar o frontend 0.3.96.
Não altera rotas, banco de dados ou regras financeiras da API.

Aplicação:
  cd /var/www/lotemobile-api
  unzip -o lotemobile-api-versionador-0.3.96.zip -d /var/www/lotemobile-api
  node --check scripts/migrate_system_releases.js
  node --check src/data/system_releases_seed.js
  node scripts/migrate_system_releases.js
