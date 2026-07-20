LARMHUB BACKEND 0.3.88

Correção do seed de movimentos de 26, 29 e 30/06/2026.

O seed agora:
- usa fin_movimento.data diretamente no PostgreSQL;
- não usa conversão UTC do Node;
- não usa dia/mes/ano para determinar a data;
- ignora registros de outras datas presentes no mesmo lote;
- valida 31 registros oficiais (11/13/7);
- valida cada duplicidade financeiramente antes de remover;
- cria backup antes da exclusão.

Prévia:
node scripts/seed_corrigir_duplicidades_movimento_26_29_30.js

Execução:
node scripts/seed_corrigir_duplicidades_movimento_26_29_30.js --execute --confirmar=N
