LARMHUB 0.4.3 — MOVIMENTO BANCÁRIO / RECEBIMENTOS DE JULHO
============================================================

OBJETIVO
--------
1. Exibir no Movimento Bancário os recebimentos vinculados a com_parcelas.movimento_id.
2. Fazer esses recebimentos comporem o Cashflow realizado.
3. Usar fin_movimento.data como fonte principal de ano/mês/dia.
4. Manter a data do movimento igual à data efetiva da baixa/ocorrência do retorno Bradesco.
5. Não liberar movimentos futuros sem baixa e não duplicar entradas.

BANCO DE DADOS
--------------
Não existe migration de estrutura nesta versão.

O versionador deve ser atualizado com:
  cd server
  npm run db:migrate:system-releases

REPARO OPCIONAL DE DATAS ANTIGAS
--------------------------------
O script não cria movimentos. Ele apenas localiza movimentos já vinculados a parcelas
recebidas cuja data difere de com_parcelas.pago_em.

Prévia obrigatória:
  cd server
  npm run db:preview:movimento-recebiveis-data

Se a prévia mostrar candidatos, execute exatamente com o total exibido. Exemplo:
  npm run db:repair:movimento-recebiveis-data -- --execute --confirmar=3

Se a prévia retornar 0, não execute reparo.

ATUALIZAÇÃO
-----------
1. Faça backup do sistema e do banco.
2. Extraia este ZIP sobre a raiz do LarmHub.
3. Execute:

  cd /caminho/do/larmhub/server
  npm install
  npm run db:migrate:system-releases
  npm run db:preview:movimento-recebiveis-data

  cd ..
  npm install
  npm run build

  pm2 restart larmhub-api --update-env
  pm2 restart NOME_DO_FRONTEND --update-env
  pm2 save

VALIDAÇÃO
---------
Após reiniciar o backend:
- Abra Movimento Bancário, ano 2026, sem filtros.
- Os recebimentos de julho vinculados ao Contas a Receber devem aparecer como entradas.
- A origem retornada pela API será "Contas a Receber".
- A data será a data de baixa/ocorrência, não a data de crédito.
- O Cashflow realizado deve usar os mesmos movimentos.

SEGURANÇA
---------
- Nenhum lançamento é criado pelo script de reparo.
- Movimentos futuros sem vínculo continuam ocultos.
- Um movimento vinculado a mais de uma parcela só tem a data corrigida quando todas as
  parcelas vinculadas possuem a mesma data de baixa.
