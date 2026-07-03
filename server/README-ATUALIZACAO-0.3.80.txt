LARMHUB BACKEND — 0.3.80
=========================

ALTERAÇÕES
----------
- Compatibilidade ampliada das permissões de inativação do Movimento Orçado.
- Endpoint existente de inativação mantido com motivo e auditoria.
- Novo endpoint:

  PATCH /financeiro/contas-receber/:id/baixar-manual

A baixa manual:
- aceita data, valor, conta bancária, forma de pagamento e observações;
- bloqueia parcela já paga ou já vinculada;
- valida a empresa da conta bancária;
- cria entrada em fin_movimento;
- vincula com_parcelas.movimento_id;
- grava origem_baixa = manual;
- registra conciliação e auditoria;
- usa transação PostgreSQL.

PUBLICAÇÃO
----------
  cd /var/www/lotemobile-api
  npm ci
  node scripts/migrate_movimento_orcado_inativacao.js
  node scripts/migrate_system_releases.js
  pm2 restart larmhub-api

A migration do Movimento Orçado usa ADD COLUMN IF NOT EXISTS e pode ser executada com segurança mais de uma vez.
Não há migration adicional para a baixa manual.
