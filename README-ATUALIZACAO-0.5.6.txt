LARMHUB BACKEND 0.5.6
ETAPA A — AUDITORIA STRATO X LARMHUB (SOMENTE LEITURA)
=======================================================

OBJETIVO
--------
Comparar um retorno Bradesco CNAB 400 e o relatório Strato correspondente com
clientes, contratos e parcelas existentes no LarmHub antes de qualquer criação,
atualização, baixa ou movimento bancário.

PROTEÇÕES
---------
- Não existe migration de banco nesta entrega.
- Não existe INSERT, UPDATE ou DELETE no auditor.
- A conexão PostgreSQL usa BEGIN TRANSACTION READ ONLY.
- A auditoria sempre termina com ROLLBACK.
- Nenhuma rota da API foi alterada.
- Nenhum processo PM2 precisa ser reiniciado para executar a auditoria.
- Não cria clientes, contratos, parcelas, baixas ou movimentos bancários.

INSTALAÇÃO
----------
Na raiz do backend 0.5.5:

  cp package.json /root/package.json-antes-0.5.6
  cp package-lock.json /root/package-lock.json-antes-0.5.6
  unzip -o larmhub-backend-0.5.6-auditoria-strato-etapa-a.zip -d .

VALIDAÇÃO ESTÁTICA
------------------
  node --check scripts/auditar_sincronizacao_strato_larmhub.js
  node --check scripts/test_auditoria_strato_larmhub.js
  npm run test:audit:strato-larmhub

Resultado esperado:
  Auditoria Strato x LarmHub: cálculos, agrupamento e proteções OK.

EXECUÇÃO PARA O RETORNO DE 23/07/2026
-------------------------------------
Copie o RET e o PDF para o servidor, por exemplo em /tmp, e execute:

  npm run db:audit:strato-larmhub -- \
    --retorno="/tmp/CB230700 LUCKY .RET" \
    --relatorio="/tmp/RET 23072026 LUCKY.pdf" \
    --saida="/tmp/auditoria-cb230700-lucky"

O comando gera:
- arquivo JSON completo;
- CSV por parcela;
- relatório Markdown legível.

Se o tenant não for reconhecido pelo arquivo já importado, informe:

  --tenant=a1000000-0000-4000-8000-000000000001

CONFIRMAÇÃO DO BACKUP SQL SERVER
--------------------------------
O arquivo BKPTMP.bak precisa ser restaurado em uma instância SQL Server para
consulta confiável. Depois da restauração, execute o arquivo:

  scripts/sqlserver/auditar_cb230700_lucky.sql

Exemplo:

  sqlcmd -S localhost -E -d BKPTMP \
    -i scripts/sqlserver/auditar_cb230700_lucky.sql \
    -W -s ";" -o resultado-cb230700-lucky.txt

O resultado deve ser conferido antes da Etapa B, que será o lote de correção em
modo de simulação. Não execute baixa manual para Márcia ou Briza antes disso.

DIAGNÓSTICO PRELIMINAR INCLUÍDO
-------------------------------
Os arquivos em docs/auditorias/CB230700-LUCKY foram produzidos com o dump
PostgreSQL enviado, o RET e o relatório Strato:

- Márcia: cliente e contrato existem; a parcela do mesmo vencimento foi
  importada como 13/30, embora o Strato informe 52/120.
- Briza: cliente e contrato existem; as parcelas 18/37 a 27/37 existem e estão
  abertas, mas os valores divergem e o boleto é consolidado.
- Nenhum cliente ou contrato novo foi confirmado nesses dois casos.

A confirmação SQL Server continua obrigatória antes de criar o lote de baixa.

VERSIONAMENTO
-------------
Depois da auditoria ser executada e conferida:

  npm run db:migrate:system-releases

Não é necessário reiniciar a API somente para executar a auditoria.
