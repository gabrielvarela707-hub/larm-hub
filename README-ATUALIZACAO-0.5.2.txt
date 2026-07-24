LARMHUB BACKEND 0.5.2
RATEIO DO CONTAS A PAGAR — ETAPA 1: SOMENTE ESTRUTURA
=====================================================

BASE ESPERADA
-------------
Backend 0.5.1.
PostgreSQL com as tabelas atuais fin_lancamentos_cp, fin_fornecedores e
fin_tipos_documento.

ESCOPO DESTA ENTREGA
--------------------
Esta atualização NÃO ativa o rateio.

Ela somente prepara o banco com:
- fin_cp_rateios: representa o documento original;
- fin_cp_rateio_itens: relaciona o grupo às partes individuais;
- fin_lancamentos_cp.rateio_id: vínculo opcional com o grupo.

NÃO FOI ALTERADO
----------------
- Nenhuma rota do backend.
- Nenhuma tela do frontend.
- Nenhuma baixa ou movimento bancário.
- Nenhum lançamento, parcela ou documento já existente.
- Nenhuma regra de documento duplicado.
- Nenhuma forma de pagamento atual.

ORDEM SEGURA DE INSTALAÇÃO
--------------------------
1. Faça backup do código e do banco.
2. Extraia este ZIP sobre a raiz do backend 0.5.1.
3. Confira a sintaxe:

   node --check scripts/migrate_rateio_contas_pagar_estrutura.js
   node --check scripts/check_rateio_contas_pagar_estrutura.js
   node --check scripts/rollback_rateio_contas_pagar_estrutura.js
   node --check src/data/system_releases_seed.js

4. Execute somente a migration estrutural:

   npm run db:migrate:rateio-cp-estrutura

5. Confira o resultado sem alterar dados:

   npm run db:check:rateio-cp-estrutura

6. Atualize o changelog:

   npm run db:migrate:system-releases

7. Reinicie o backend apenas para refletir a versão 0.5.2 no processo:

   pm2 restart larmhub-api --update-env
   pm2 save

RESULTADO ESPERADO DA CONFERÊNCIA
---------------------------------
- Tabela fin_cp_rateios: OK
- Tabela fin_cp_rateio_itens: OK
- Coluna fin_lancamentos_cp.rateio_id BIGINT: OK
- Constraints: 10/10
- Índices: 5/5
- Grupos cadastrados: 0
- Itens cadastrados: 0
- Lançamentos antigos vinculados: 0

ROLLBACK
--------
Antes da próxima etapa, a estrutura pode ser removida com:

   npm run db:rollback:rateio-cp-estrutura

O rollback recusa automaticamente a execução se existir qualquer grupo, item
ou lançamento vinculado. Não existe opção de forçar a exclusão.

IMPORTANTE
----------
Não publique nenhum frontend de rateio nesta etapa. A funcionalidade continuará
invisível e o Contas a Pagar seguirá operando exatamente como antes.
