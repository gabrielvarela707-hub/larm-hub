LARMHUB BACKEND 0.5.9
CORREÇÃO CONTROLADA DO RETORNO CB230700 LUCKY

ESCOPO
- Corrige somente as duas ocorrências pendentes do retorno CB230700 LUCKY.
- Não cria clientes nem contratos.
- Não altera os quatro títulos já conciliados.
- Não consolida parcelas.
- Cria 11 baixas e 11 Movimentos Bancários individuais.
- Usa 22/07/2026 como data de recebimento, baixa e Movimento Bancário.
- Preserva 23/07/2026 apenas como data de crédito bancário nos metadados.

COMPOSIÇÃO
1) MARCIA BEATRIZ DE OLIVEIRA SANTOS — parcela 052/120
   Nominal: R$ 1.715,93
   Juros: R$ 58,25
   Desconto: R$ 0,00
   Recebido: R$ 1.774,18

2) BRIZA LUCCI MAUSE — parcelas 018/037 a 027/037
   Parcelas 018 a 026:
   Nominal unitário: R$ 2.073,21
   Desconto unitário: R$ 225,73
   Recebido unitário: R$ 1.847,48

   Parcela 027:
   Nominal: R$ 2.073,21
   Desconto: R$ 225,74
   Recebido: R$ 1.847,47

TOTAIS DO LOTE
- Nominal: R$ 22.448,03
- Descontos: R$ 2.257,31
- Juros: R$ 58,25
- Recebido: R$ 20.248,97

PROTEÇÕES
- Prévia padrão sem gravação.
- Execução somente com --execute --confirmar=11.
- Bloqueio das parcelas e dos itens do retorno durante a transação.
- Validação exata do estado atual antes da primeira alteração.
- COMMIT somente após validar as 11 parcelas e os 11 movimentos.
- Backup JSON dos registros originais antes da execução.
- Lote idempotente: CR-CB230700-LUCKY-20260722-059.
- Conferência somente leitura.
- Rollback recusado se detectar alterações posteriores.

INSTALAÇÃO
Na raiz do backend:

  cd /var/www/lotemobile-api

Faça primeiro o backup habitual do banco e dos arquivos do backend.

  cp package.json /root/package.json-antes-0.5.9
  cp package-lock.json /root/package-lock.json-antes-0.5.9
  cp data/system_releases_seed.js /root/system_releases_seed.js-antes-0.5.9

Extraia o pacote:

  unzip -o larmhub-backend-0.5.9-correcao-cb230700-lucky.zip -d .

VALIDAÇÃO ESTÁTICA

  node --check scripts/cb230700_lucky_plan.js
  node --check scripts/aplicar_correcao_cb230700_lucky.js
  node --check scripts/conferir_correcao_cb230700_lucky.js
  node --check scripts/rollback_correcao_cb230700_lucky.js
  node --check scripts/test_correcao_cb230700_lucky.js
  npm run test:fix:cb230700-lucky

PRÉVIA OBRIGATÓRIA

  npm run db:fix:cb230700-lucky

A prévia deve indicar:
- 11 parcelas a baixar;
- 11 movimentos individuais;
- data 22/07/2026;
- desconto total R$ 2.257,31;
- juros R$ 58,25;
- recebido R$ 20.248,97;
- nenhum dado alterado.

EXECUÇÃO
Somente depois de conferir a prévia:

  npm run db:fix:cb230700-lucky -- --execute --confirmar=11

Guarde o caminho exibido em "Backup para rollback".

CONFERÊNCIA PÓS-APLICAÇÃO

  npm run db:check:cb230700-lucky

Resultado final esperado:
- 11/11 parcelas;
- 11/11 movimentos individuais;
- todas as datas em 22/07/2026;
- desconto total R$ 2.257,31;
- juros total R$ 58,25;
- recebido total R$ 20.248,97;
- retorno com 6 conciliados e 0 não localizados.

Depois da conferência:

  npm run db:migrate:system-releases

Não é necessário reiniciar o PM2, pois esta entrega adiciona somente scripts administrativos, versão e changelog.
Não reenvie o arquivo de retorno: a execução atualiza diretamente o retorno já processado.

ROLLBACK
Primeiro execute a prévia usando exatamente o arquivo informado após a aplicação:

  npm run db:rollback:cb230700-lucky -- --backup="/var/backups/larmhub/cb230700-lucky/ARQUIVO-antes.json"

Se a prévia estiver correta:

  npm run db:rollback:cb230700-lucky -- --backup="/var/backups/larmhub/cb230700-lucky/ARQUIVO-antes.json" --execute --confirmar=11

O rollback restaura as 11 parcelas, os dois itens do retorno e o resumo do retorno, e remove somente os 11 movimentos do lote 0.5.9.
