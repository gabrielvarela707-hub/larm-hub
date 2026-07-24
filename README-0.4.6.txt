Backend 0.4.6 — somente arquivos alterados.
Extraia diretamente em /var/www/lotemobile-api.
Depois execute:
npm install
npm run db:migrate:tenant-config
npm run db:migrate:system-releases
pm2 restart larmhub-api --update-env
pm2 save
