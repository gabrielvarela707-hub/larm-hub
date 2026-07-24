LARMHUB API — ATUALIZAÇÃO 0.3.53

Correção
- O boleto Bradesco passa a reconhecer o recálculo já salvo na parcela.
- A data de cobrança usa data_recalculo e, se necessário, a data registrada em recalculo_dados.
- A comparação com o dia atual usa America/Sao_Paulo por padrão para evitar erro na virada do dia UTC.
- O valor final recalculado continua sendo utilizado no boleto e na remessa.

Instalação
1. Extraia este ZIP diretamente em /var/www/lotemobile-api.
2. Execute:
   cd /var/www/lotemobile-api
   node scripts/migrate_system_releases.js
   pm2 restart larmhub-api
   pm2 logs larmhub-api --lines 80

Não há migration de banco e não há atualização de frontend.

Configuração opcional
- O fuso pode ser alterado com FINANCIAL_TIMEZONE.
- Padrão: America/Sao_Paulo.
