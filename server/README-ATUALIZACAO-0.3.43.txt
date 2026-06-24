LARMHUB 0.3.43 — CONTAS A RECEBER / BASE COMERCIAL — FASE 1
================================================================

ESCOPO DESTA VERSÃO
-------------------
Esta atualização cria apenas a fundação do banco para clientes, produtos,
serviços, contratos e receitas. A tela atual de Contas a Receber e as parcelas
existentes não são alteradas nesta fase.

ESTRUTURA CRIADA / EVOLUÍDA
---------------------------
- cad_produtos
- cad_servicos
- fin_tipos_receita
- fin_receitas
- com_contrato_itens
- com_contratos: adiciona vínculo com cad_clientes e campos genéricos

IMPORTANTE
----------
A tabela com_parcelas já existe e NÃO foi duplicada como parcelas_clientes.
Na Fase 2 ela será ampliada para receber receita_id, dados de correção, documento,
obra/unidade legada e composição completa dos valores a receber.

PRÉ-REQUISITOS
--------------
Antes desta migration devem existir:
- cad_pessoas
- cad_clientes
- com_contratos

APLICAÇÃO
---------
1. Faça backup do PostgreSQL.
2. Extraia este ZIP diretamente em /var/www/lotemobile-api.
3. Execute:

   cd /var/www/lotemobile-api
   node scripts/migrate_receitas_contratos_fase1.js

4. Confira os catálogos legados sem gravar:

   node scripts/seed_catalogos_receitas_legado.js --preview

5. Para importar apenas obras/produtos/serviços do legado:

   node scripts/seed_catalogos_receitas_legado.js --execute

   Se houver mais de um tenant:

   node scripts/seed_catalogos_receitas_legado.js --execute --tenant=UUID_DO_TENANT

6. Registre o changelog e reinicie a API:

   node scripts/migrate_system_releases.js
   pm2 restart larmhub-api

O seed NÃO importa contratos, receitas ou parcelas. Ele importa somente:
- tb2_obra -> cad_produtos (tipo obra)
- ts1_prod -> cad_produtos, se houver registros
- ts1_serv -> cad_servicos
