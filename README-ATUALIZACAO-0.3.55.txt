LARMHUB API 0.3.55

AJUSTE
- Na visão diária do Cash Flow, o saldo final lançado em cada aplicação é mantido nos dias seguintes do mesmo mês.
- Um novo lançamento na mesma aplicação substitui o saldo anterior a partir da nova data.
- O valor não é carregado para o mês seguinte.
- O total da linha usa a última posição do mês, e não a soma dos saldos diários repetidos.

ARQUIVOS ALTERADOS
- src/routes/financeiro.js
- src/data/system_releases_seed.js
- data/system_releases_seed.js
- package.json
- package-lock.json

ATUALIZAÇÃO
1. Extraia este ZIP diretamente em /var/www/lotemobile-api.
2. Execute:
   node scripts/migrate_system_releases.js
   pm2 restart larmhub-api

Não há migration de banco nem atualização de frontend.
