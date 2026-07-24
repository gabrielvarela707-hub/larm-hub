LARMHUB — ATUALIZAÇÃO 0.3.44
CONTAS A RECEBER — CONTRATOS, RECEITAS E PARCELAS — FASE 2

OBJETIVO
Importar o saldo em aberto do relatório Strato com posição em 01/06/2026,
relacionando os clientes já cadastrados com obras/unidades, contratos,
receitas e parcelas.

ESTRUTURA PRESERVADA
- Não foi criada uma segunda tabela de parcelas.
- A tabela existente com_parcelas foi ampliada.
- Parcelas pagas e contratos quitados/encerrados são preservados em reexecuções.
- A importação usa identificadores legados únicos para não duplicar registros.

DADOS PREPARADOS
- 126 clientes distintos
- 137 unidades/produtos
- 137 contratos
- 251 receitas/itens contratuais
- 13.502 parcelas em aberto
- Total do relatório: R$ 21.031.875,59
- Obras: 7698, 7700 e 7701

IMPORTANTE
O relatório contém somente a posição de valores em aberto. Por isso, o valor_total
dos contratos importados representa o saldo em aberto conhecido, e não o valor
histórico integral do contrato. Essa informação fica registrada em dados_adicionais.

APLICAÇÃO
1. Faça backup do PostgreSQL.
2. Extraia este pacote diretamente em /var/www/lotemobile-api.
3. Execute a migration:

   cd /var/www/lotemobile-api
   node scripts/migrate_receitas_parcelas_fase2.js

4. Execute primeiro a prévia para o tenant do Residencial Santa Clara:

   node scripts/seed_recebiveis_relatorio_strato.js \
     --preview \
     --tenant=a1000000-0000-4000-8000-000000000001

5. A prévia deve indicar:
   - 137 contratos vinculados
   - 0 clientes ausentes
   - 0 clientes ambíguos
   - 251 receitas
   - 13.502 parcelas

6. Confirme a importação:

   node scripts/seed_recebiveis_relatorio_strato.js \
     --execute \
     --tenant=a1000000-0000-4000-8000-000000000001

7. Atualize o changelog e reinicie a API:

   node scripts/migrate_system_releases.js
   pm2 restart larmhub-api
   pm2 logs larmhub-api --lines 80

8. Rode novamente a prévia. O esperado será:
   - novos contratos: 0
   - novas receitas: 0
   - novas parcelas: 0

ARQUIVOS PRINCIPAIS
- scripts/migrate_receitas_parcelas_fase2.js
- scripts/seed_recebiveis_relatorio_strato.js
- scripts/imports/recebiveis-strato-2026-06-01.json
- scripts/migrate_system_releases.js
- data/system_releases_seed.js
- src/data/system_releases_seed.js

NÃO É NECESSÁRIO ALTERAR O FRONTEND NESTA FASE.
A tela atual de Contas a Receber já usa com_contratos e com_parcelas.
