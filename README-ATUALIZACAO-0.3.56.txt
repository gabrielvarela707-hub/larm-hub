LARMHUB API 0.3.56

AJUSTE
- Habilita a gravação dos saldos de aplicações na visão diária do Cash Flow.
- O valor informado em um dia permanece nos dias seguintes do mesmo mês até uma nova posição.
- As linhas agregadas continuam calculadas automaticamente.

ARQUIVOS ALTERADOS
- src/routes/financeiro.js
- scripts/migrate_cashflow_valores_diarios.js
- src/data/system_releases_seed.js
- data/system_releases_seed.js
- package.json
- package-lock.json

ATUALIZAÇÃO
1. Extraia este ZIP diretamente em /var/www/lotemobile-api.
2. Execute:
   node scripts/migrate_cashflow_valores_diarios.js
   node scripts/migrate_system_releases.js
   pm2 restart larmhub-api
