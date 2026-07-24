LarmHub API 0.3.89 — Movimento Bancário e versionador

Esta versão inclui a correção da exibição dos movimentos de 29 e 30/06/2026 e o versionador interno que estava ausente no pacote anterior.

Instalação no diretório /var/www/lotemobile-api:

1. Criar backup:
   cp src/routes/financeiro.js src/routes/financeiro.js.bak-0389
   cp src/data/system_releases_seed.js src/data/system_releases_seed.js.bak-0389
   cp package.json package.json.bak-0389
   cp package-lock.json package-lock.json.bak-0389

2. Extrair este pacote na raiz da API.

3. Validar:
   node --check src/routes/financeiro.js
   node --check src/data/system_releases_seed.js
   node --check scripts/migrate_system_releases.js

4. Atualizar o versionador/changelog no banco:
   node scripts/migrate_system_releases.js

5. Reiniciar a API:
   pm2 restart larmhub-api
   pm2 logs larmhub-api --lines 50

6. Conferir a versão atual:
   SELECT version, frontend_version, backend_version, is_current
   FROM hub_system_releases
   WHERE is_current = true;

Resultado esperado:
   version=0.3.89
   frontend_version=0.3.87
   backend_version=0.3.89
   is_current=true
