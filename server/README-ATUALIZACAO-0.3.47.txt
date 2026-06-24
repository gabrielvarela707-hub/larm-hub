LARMHUB API — ATUALIZAÇÃO 0.3.47

1. Faça backup do PostgreSQL.
2. Extraia este ZIP diretamente em /var/www/lotemobile-api.
3. Execute:

   cd /var/www/lotemobile-api
   node scripts/migrate_recalculo_bradesco_recebiveis.js
   node scripts/migrate_system_releases.js
   pm2 restart larmhub-api
   pm2 logs larmhub-api --lines 80

A configuração inicial Bradesco é criada em modo de HOMOLOGAÇÃO.
Não marque como homologada antes de validar o primeiro arquivo TST com o banco.
