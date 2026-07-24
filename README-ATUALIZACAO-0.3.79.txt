LARMHUB BACKEND 0.3.79
Movimento Bancário 29/30 de junho e limpeza integral do Contas a Pagar

1) MOVIMENTO BANCÁRIO — 29 E 30/06/2026
Foi criado um seed específico e idempotente para inserir somente os 20 lançamentos faltantes:
- 29/06/2026: 13 registros
- 30/06/2026: 7 registros
- Entradas: R$ 129.498,9900
- Saídas: R$ 143.258,6400

O seed:
- compara os registros pelo conteúdo antes de inserir;
- não insere 01/07/2026;
- calcula dia, mês e ano diretamente pela Data;
- registra lote, arquivo de origem, linha da planilha e hash;
- gera backup dos movimentos já existentes em 29 e 30/06;
- usa transação e bloqueio da tabela.

PRÉVIA
  node scripts/seed_movimento_bancario_2026_06_29_30.js

EXECUÇÃO ESPERADA, CASO A PRÉVIA MOSTRE 20 FALTANTES
  node scripts/seed_movimento_bancario_2026_06_29_30.js --execute --confirmar=20

Se a prévia mostrar outra quantidade, use exatamente a quantidade exibida. Se mostrar zero, não execute.

2) LIMPEZA TOTAL DO CONTAS A PAGAR
Foi criado um seed para apagar integralmente:
- fin_lancamentos_cp;
- fin_parcelas_cp;
- fin_lancamentos_cp_boletos, quando existir.

O seed:
- abre em modo prévia;
- exige confirmação com a quantidade atual de lançamentos;
- cria backup JSON compactado em scripts/backups;
- cria cópia adicional em fin_importacao_backup, quando a tabela existir;
- usa transação e bloqueio exclusivo;
- valida que Contas a Pagar ficou vazio antes do COMMIT;
- NÃO apaga registros de fin_movimento.

PRÉVIA
  node scripts/seed_limpar_todas_contas_pagar.js

A prévia mostrará, por exemplo:
  Lançamentos: 83
  Para executar: --execute --confirmar=83

EXECUÇÃO
  node scripts/seed_limpar_todas_contas_pagar.js --execute --confirmar=QUANTIDADE_DA_PREVIA

IMPACTOS ESPERADOS DA LIMPEZA
- Contas a Pagar ficará completamente vazia para lançamentos manuais a partir de 01/07/2026.
- Movimentos bancários históricos serão preservados.
- Movimentos que antes estavam ligados a parcelas de Contas a Pagar perderão somente esse vínculo e poderão aparecer como Realizado, em vez de Pago.
- Valores futuros/em aberto de Contas a Pagar deixarão de compor o Cash Flow, pois os títulos serão removidos.
- As sequências de IDs não são reiniciadas.

3) VERSIONAMENTO
Depois dos seeds:
  node scripts/migrate_system_releases.js
  pm2 restart larmhub-api

ORDEM RECOMENDADA
1. npm ci
2. Prévia e execução do Movimento Bancário de 29/30.
3. Prévia e execução da limpeza total do Contas a Pagar.
4. node scripts/migrate_system_releases.js
5. pm2 restart larmhub-api
6. Publicar o frontend 0.3.79.
