LARMHUB API 0.3.58 — CONTAS A RECEBER / LARM x LUCKY
=====================================================

DIAGNÓSTICO CONFIRMADO NO BANCO CONVERTIDO
-------------------------------------------
- Obra 7698: LUCKY CAPITAL EMPREENDIMENTOS LTDA (cemp1_cod=2)
  99 contratos/lotes e 10.025 parcelas.
- Obra 7700: LARM PARTICIPAÇÕES LTDA (cemp1_cod=1)
  37 contratos/lotes e 3.448 parcelas.
- Obra 7701: LARM, com 1 contrato de aluguel e 29 parcelas.
- Total auditado: 137 contratos e 13.502 parcelas.
- Não existem divergências entre contrato, parcela, unidade e produto na base
  PostgreSQL enviada. A separação dos lotes já estava correta no banco.

LANÇAMENTOS COM VENCIMENTO DE MARÇO A JUNHO DE 2026
---------------------------------------------------
- LUCKY / obra 7698: 136 parcelas, total de R$ 208.131,34.
- LARM / obra 7700: 48 parcelas, total de R$ 76.290,23.
- LARM / obra 7701 (aluguel): 6 parcelas, total de R$ 17.080,33.
- Total do período: 190 parcelas, R$ 301.501,90.

CAUSA DO BOLETO INCORRETO
-------------------------
O backend selecionava sempre a primeira configuração Bradesco e priorizava a
empresa LARM antes de consultar a obra da parcela. Como o banco possui somente
a configuração bancária da LARM, uma parcela da obra 7698/LUCKY recebeu Nosso
Número e boleto com os dados da LARM.

Foram localizados apenas dois boletos emitidos:
- 1 boleto da obra 7700/LARM: permanece preservado.
- 1 boleto da obra 7698/LUCKY: não possui remessa, pagamento ou liquidação e
  será liberado pelo seed para reemissão após cadastrar a configuração LUCKY.

AJUSTES DA VERSÃO 0.3.58
------------------------
1. Boleto individual seleciona a configuração por obra/empresa:
   - 7698 -> LUCKY
   - 7700 -> LARM
   - 7701 -> LARM
2. Remessa não aceita parcelas misturadas entre LARM e LUCKY.
3. Configuração bancária pode ser consultada por empresa ou obra.
4. A listagem e a exportação retornam empresa_cobranca.
5. A API aceita filtro empresa=LARM ou empresa=LUCKY.
6. O seed normaliza os vínculos de obra, unidade, produto, contrato, receita e
   parcela, fazendo a parcela herdar a obra validada do contrato.
7. Status aberta/atrasada é atualizado até a data informada em --as-of.
8. O boleto LUCKY antigo é limpo somente se não houver remessa, pagamento ou
   liquidação e se ainda não estiver identificado como boleto LUCKY corrigido.
9. Novos boletos/remessas registram empresa e config_id nos metadados, tornando
   futuras execuções do seed seguras e idempotentes.
10. Remessas, retornos, baixas e pagamentos existentes são preservados.

LIMITAÇÃO DA ATUALIZAÇÃO FINANCEIRA
-----------------------------------
Os recebíveis foram importados do relatório Strato com posição em 01/06/2026.
No PostgreSQL convertido, a tabela legada ts1_core possui último pagamento em
22/04/2026, última criação em 02/04/2026 e última cobrança em 29/04/2026.
Portanto, essa cópia não contém baixas de maio/junho que possam ser conciliadas
com segurança. A versão atualiza a classificação, os vínculos e o vencimento
até 23/06/2026, mas não inventa pagamentos posteriores ao relatório.

IMPORTANTE — CONFIGURAÇÃO LUCKY
-------------------------------
O banco enviado possui somente a configuração bancária real da LARM.
A versão não copia nem inventa agência, conta, beneficiário ou código de
empresa para a LUCKY. Antes de gerar boleto ou remessa da obra 7698, cadastre a
configuração Bradesco real da LUCKY pelo sistema/API.

ARQUIVOS ALTERADOS
------------------
- src/routes/recebiveis.js
- src/data/system_releases_seed.js
- scripts/seed_recebiveis_obras_empresas_2026_06.js
- package.json
- package-lock.json
- README-ATUALIZACAO-0.3.58.txt

COMANDOS
--------
1. Faça um backup do PostgreSQL atual.

2. Prévia sem alterar dados:
   npm run db:preview:recebiveis:obras-empresas -- --tenant=a1000000-0000-4000-8000-000000000001 --as-of=2026-06-23

3. Confira no log:
   - obra 7698 / LUCKY: aproximadamente 99 contratos e 10.025 parcelas;
   - obra 7700 / LARM: aproximadamente 37 contratos e 3.448 parcelas;
   - lucky_reemissao_segura: 1;
   - lucky_revisao_manual: 0.

4. Aplicar:
   npm run db:seed:recebiveis:obras-empresas -- --tenant=a1000000-0000-4000-8000-000000000001 --as-of=2026-06-23

5. Reiniciar a API:
   pm2 restart larmhub-api

6. Cadastrar a configuração Bradesco real da LUCKY antes de reemitir o boleto
   da obra 7698.

A prévia deve ser executada antes da aplicação em produção.
