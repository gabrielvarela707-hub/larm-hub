LARMHUB API 0.3.54

Correção: boleto/remessa Bradesco após recálculo salvo.

Arquivos alterados:
- src/routes/recebiveis.js
- src/data/system_releases_seed.js
- data/system_releases_seed.js
- package.json
- package-lock.json

Aplicação:
1. Extrair este ZIP diretamente em /var/www/lotemobile-api
2. Executar:
   node scripts/migrate_system_releases.js
   pm2 restart larmhub-api
   pm2 logs larmhub-api --lines 80

Não há migration de banco nesta versão.
