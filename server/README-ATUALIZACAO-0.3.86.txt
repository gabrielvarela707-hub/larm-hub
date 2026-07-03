LARMHUB BACKEND 0.3.86 — ATUALIZAÇÃO INCREMENTAL

Esta atualização contém somente os arquivos alterados da versão 0.3.85 para a 0.3.86.
Não há alteração de frontend.

DIAGNÓSTICO CONFIRMADO NO fin_movimento.sql
- 26/06: 22 registros, sendo 11 oficiais e 11 duplicados.
- 29/06: 52 registros, sendo 13 oficiais e 39 duplicados.
- 30/06: 28 registros, sendo 7 oficiais e 21 duplicados.
- Total atual nessas datas: 102.
- Total correto: 31.
- Duplicidades a remover na base analisada: 71.

LOTE PRESERVADO
MOV-2026-ATE-0107-20260702020021

LOTES DUPLICADOS ELEGÍVEIS
MOV-2026-20260629-30-0379
MOV-2026-20260629-30-0383
MOV-2026-20260626-30-0384
MOV-2026-20260629-30-0385 (somente se existir)

PROCEDIMENTO
1. Copiar os arquivos para o backend.
2. Executar a prévia:
   node scripts/seed_corrigir_duplicidades_movimento_26_29_30.js
3. Conferir a quantidade apresentada.
4. Executar usando a quantidade real:
   node scripts/seed_corrigir_duplicidades_movimento_26_29_30.js --execute --confirmar=N
5. Conferir a carga:
   node scripts/seed_movimento_bancario_2026_06_29_30.js
   O resultado esperado após a limpeza é zero faltantes.
6. Registrar a versão:
   node scripts/migrate_system_releases.js
7. Reiniciar a API:
   pm2 restart larmhub-api

IMPORTANTE
- Não execute novamente a carga de 20 registros antes da limpeza.
- O seed de limpeza interrompe se encontrar vínculos com parcelas ou lançamentos bancários.
- Um backup JSON compactado é criado antes da exclusão.
