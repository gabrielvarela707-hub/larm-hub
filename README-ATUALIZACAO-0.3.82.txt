LARM HUB — BACKEND 0.3.82 (INCREMENTAL)
=========================================

Este pacote contém somente os arquivos alterados da versão 0.3.81 para a 0.3.82.
Não é cumulativo.

CORREÇÕES
---------
1. Movimento Orçado
   - Adicionada rota POST /financeiro/orcamento/movimento/:id/inativar.
   - Mantida a rota PATCH anterior para compatibilidade.
   - As duas rotas usam o mesmo handler transacional e registram auditoria.

2. Retorno Bradesco
   - O seed agora seleciona automaticamente o tenant LARM em bases com múltiplos tenants.
   - A opção --tenant=UUID continua disponível, mas não é necessária na base analisada.

PUBLICAÇÃO
----------
1. Copie este pacote sobre /var/www/lotemobile-api.
2. Execute:

   cd /var/www/lotemobile-api
   npm ci
   node scripts/migrate_system_releases.js
   pm2 restart larmhub-api
   pm2 status

A migration migrate_retorno_bradesco_strato.js já foi executada com sucesso e não precisa ser repetida.
Não existe migration nova na versão 0.3.82.

RETORNOS BRADESCO
-----------------
Prévia:

   node scripts/seed_processar_retornos_bradesco_ate_2026_07_01.js

O seed deve selecionar automaticamente:

   LARM Group (larm)

Depois use a quantidade exibida na prévia:

   node scripts/seed_processar_retornos_bradesco_ate_2026_07_01.js --execute --confirmar=QUANTIDADE

IMPORTANTE
----------
O pm2 restart é obrigatório. Sem reiniciar a API, a rota nova continua sem existir no processo em execução.
