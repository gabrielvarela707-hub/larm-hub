LARMHUB 0.3.51 — BACKEND

1. Extraia este pacote diretamente em /var/www/lotemobile-api.
2. Execute:
   node scripts/migrate_system_releases.js
   pm2 restart larmhub-api

Alteração:
- O recálculo agora localiza valores mensais de IPCA/IGP-M pelo código normalizado do índice e não apenas pelo ID salvo no contrato.
- Referências de data são retornadas no formato YYYY-MM-DD para evitar divergência de fuso/formatação.

Não há migration de banco nesta versão.
