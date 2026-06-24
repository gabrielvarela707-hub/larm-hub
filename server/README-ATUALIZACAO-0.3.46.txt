LARMHUB BACKEND v0.3.46

CONTAS A RECEBER OPERACIONAL
- Endpoints reais de listagem, filtros e exportação:
  GET /financeiro/contas-receber
  GET /financeiro/contas-receber/filtros
  GET /financeiro/contas-receber/exportar
- Consulta com_parcelas, com_contratos, fin_receitas, fin_tipos_receita, cad_clientes e cad_produtos.
- Paginação e filtros por cliente, receita, obra, status e vencimento.
- Valor do Strato usa valor_total_relatorio, evitando duplicar correção e encargos.
- Migration prepara o relacionamento da parcela com o Movimento Bancário.

ATUALIZAÇÃO
cd /var/www/lotemobile-api
node scripts/migrate_contas_receber_operacional.js
node scripts/migrate_system_releases.js
pm2 restart larmhub-api
pm2 logs larmhub-api --lines 80

IMPORTANTE
A migration não faz conciliação retroativa automática. Ela prepara os campos movimento_id,
origem_baixa, conciliado_em e conciliacao_dados. A rotina de conciliação bancária deverá
preencher esse vínculo quando identificar o recebimento.

O histórico completo de parcelas pagas ainda deve ser importado das tabelas legadas
Strato ts1_bole/ts1_core. A tela já está preparada para exibi-lo após essa importação.
