LARMHUB API — ATUALIZAÇÃO 0.3.48
==================================

CORREÇÃO
- Corrige o erro "Vencimento inválida" ao recalcular parcelas atrasadas.
- Normaliza datas vindas do PostgreSQL como DATE, objeto Date, timestamp ISO ou DD/MM/AAAA.
- Aplica a mesma correção à geração de boleto/remessa e às referências dos índices.
- Não altera valores financeiros nem exige migration de banco.

INSTALAÇÃO
1. Extraia este pacote diretamente em /var/www/lotemobile-api.
2. Execute:

   cd /var/www/lotemobile-api
   node scripts/migrate_system_releases.js
   pm2 restart larmhub-api
   pm2 logs larmhub-api --lines 80

3. Abra novamente o modal Recalcular e clique em Atualizar cálculo.
