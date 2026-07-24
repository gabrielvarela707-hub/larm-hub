LARM HUB — BACKEND 0.3.84 (INCREMENTAL)

Este pacote contém somente os arquivos alterados da versão 0.3.83 para a 0.3.84.
Não há frontend nesta versão.

CORREÇÕES
1. Movimento Bancário
   - Confere a planilha no intervalo de 26 a 30/06/2026.
   - Fonte: 11 registros em 26/06, 0 em 27/06, 0 em 28/06, 13 em 29/06 e 7 em 30/06.
   - Insere somente os faltantes. Na situação mostrada pelo cliente, o esperado é 20 faltantes (29 e 30).

2. Retornos Bradesco
   - LARM e LUCKY passam a ser identificadas pelo código do cabeçalho CNAB.
   - O código 4352309 é LARM e o código 4798045 é LUCKY.
   - Corrige a configuração legada da LUCKY que possuía o código da LARM e classificava todos os arquivos como LUCKY.
   - O tenant correto dos recebíveis é selecionado pelas configurações Bradesco e pelas parcelas existentes.

PUBLICAÇÃO
Copie este ZIP sobre /var/www/lotemobile-api.
Não é necessário npm ci porque não houve alteração de dependências.

PRÉVIA DO MOVIMENTO
node scripts/seed_movimento_bancario_2026_06_29_30.js

EXECUÇÃO DO MOVIMENTO
Use a quantidade numérica exibida na prévia:
node scripts/seed_movimento_bancario_2026_06_29_30.js --execute --confirmar=N

PRÉVIA DOS RETORNOS
node scripts/seed_processar_retornos_bradesco_ate_2026_07_01.js --tenant=a1000000-0000-4000-8000-000000000001

IMPORTANTE
Nunca escreva literalmente QUANTIDADE_DA_PREVIA. Substitua pelo número exibido, por exemplo --confirmar=11.

EXECUÇÃO DOS RETORNOS
node scripts/seed_processar_retornos_bradesco_ate_2026_07_01.js --tenant=a1000000-0000-4000-8000-000000000001 --execute --confirmar=N

FINALIZAÇÃO
node scripts/migrate_system_releases.js
pm2 restart larmhub-api
pm2 status
