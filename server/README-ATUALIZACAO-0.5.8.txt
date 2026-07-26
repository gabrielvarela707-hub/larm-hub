LARMHUB BACKEND 0.5.8 — ETAPA B DA SINCRONIZAÇÃO STRATO
=========================================================

OBJETIVO
--------
Corrigir a normalização de datas da auditoria 0.5.7 e gerar uma simulação
somente leitura das correções necessárias. Esta versão NÃO executa baixas,
não cria movimentos, não cria clientes e não altera parcelas.

BACKUP RECOMENDADO
------------------
cd /var/www/lotemobile-api
cp package.json /root/package.json-antes-0.5.8
cp package-lock.json /root/package-lock.json-antes-0.5.8
cp scripts/auditar_sincronizacao_strato_larmhub.js \
  /root/auditar_sincronizacao_strato_larmhub.js-antes-0.5.8

INSTALAÇÃO
----------
unzip -o larmhub-backend-0.5.8-simulacao-strato-etapa-b.zip -d .

VALIDAÇÃO ESTÁTICA
------------------
node --check scripts/auditar_sincronizacao_strato_larmhub.js
node --check scripts/simular_sincronizacao_strato_larmhub.js
node --check scripts/test_auditoria_strato_larmhub.js
node --check scripts/test_simulacao_strato_larmhub.js

npm run test:audit:strato-larmhub
npm run test:simulate:strato-larmhub

RESULTADOS ESPERADOS
--------------------
Auditoria Strato x LarmHub: cálculos, agrupamento e proteções OK.
Simulação Strato x LarmHub: correspondências, centavos e proteções somente leitura OK.

NÃO É NECESSÁRIO REINICIAR O PM2.
NÃO EXECUTE MIGRATION PARA RODAR A SIMULAÇÃO.

1) REFAZER A AUDITORIA COM A CORREÇÃO DE DATAS
----------------------------------------------
rm -rf "/tmp/auditoria-cb230700-lucky-v058"

npm run db:audit:strato-larmhub -- \
  --retorno="/tmp/CB230700 LUCKY .RET" \
  --relatorio="/tmp/RET 23072026 LUCKY.pdf" \
  --saida="/tmp/auditoria-cb230700-lucky-v058"

2) GERAR A ETAPA B — SOMENTE LEITURA
------------------------------------
rm -rf "/tmp/simulacao-cb230700-lucky"

npm run db:simulate:strato-larmhub -- \
  --auditoria="/tmp/auditoria-cb230700-lucky-v058/cb230700-lucky-auditoria.json" \
  --saida="/tmp/simulacao-cb230700-lucky"

ARQUIVOS ESPERADOS
------------------
/tmp/simulacao-cb230700-lucky/cb230700-lucky-simulacao.json
/tmp/simulacao-cb230700-lucky/cb230700-lucky-simulacao-componentes.csv
/tmp/simulacao-cb230700-lucky/cb230700-lucky-simulacao.md

CONFERÊNCIA
-----------
ls -lah "/tmp/simulacao-cb230700-lucky"
cat "/tmp/simulacao-cb230700-lucky/cb230700-lucky-simulacao.md"

EXPECTATIVA COM A POSIÇÃO ANALISADA
----------------------------------
Liquidações analisadas: 6
Já conciliadas, sem ação: 4
Propostas de correção: 2
Parcelas nas propostas: 11
Movimentos a criar: 2
Valor proposto: R$ 20.248,97
Conflitos estruturais: 0

Os dois planos continuarão com bloqueio de confirmação no SQL Server. Isso é
intencional. O comando apenas descreve o que uma futura etapa poderá fazer.

PROTEÇÕES
---------
- BEGIN TRANSACTION READ ONLY.
- ROLLBACK obrigatório.
- Nenhum modo de execução disponível.
- --execute, --aplicar e --confirmar são recusados.
- Registros já conciliados são classificados como SEM AÇÃO.
- Nenhuma alteração em clientes, contratos, parcelas, baixas ou movimentos.

CHANGELOG
---------
Após validar os relatórios, o registro de versão pode ser atualizado com:

npm run db:migrate:system-releases

Esse comando atualiza somente o changelog do sistema; não faz as correções financeiras.
