LARMHUB API — Atualização 0.3.49

Correção pontual no módulo Orçamento:
- O TOTAL de SALDO FINAL não soma mais os saldos mensais.
- O TOTAL mostra o último saldo mensal disponível do ano.
- A mesma regra vale para as linhas do bloco de saldo final.
- Receitas e despesas continuam somando normalmente.

Aplicação:
1. Extraia este ZIP diretamente em /var/www/lotemobile-api
2. Execute:
   cd /var/www/lotemobile-api
   node scripts/migrate_system_releases.js
   pm2 restart larmhub-api

Não há migration de banco e não é necessário reimportar o orçamento.
