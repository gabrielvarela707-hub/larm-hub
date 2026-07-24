LARMHUB BACKEND 0.3.85 — ATUALIZAÇÃO INCREMENTAL

Esta atualização contém somente a correção do seed do Movimento Bancário em relação à 0.3.84.
Não contém frontend e não é cumulativa.

CORREÇÃO
- 26/06 é somente referência e nunca será inserido pelo seed.
- Somente os movimentos faltantes de 29 e 30/06 são elegíveis.
- Máximo absoluto: 20 registros (13 de 29/06 e 7 de 30/06).
- A conferência tolera diferenças de fornecedor, natureza, acentuação e grafia do banco.

PRÉVIA
  node scripts/seed_movimento_bancario_2026_06_29_30.js

RESULTADO ESPERADO NA SITUAÇÃO ATUAL
  Faltantes para inserir: 20
  Entradas faltantes: R$ 129.498,99
  Saídas faltantes: R$ 143.258,64

EXECUÇÃO
  node scripts/seed_movimento_bancario_2026_06_29_30.js --execute --confirmar=20

IMPORTANTE
- Não execute a versão anterior com --confirmar=31.
- Depois da carga de 29/30, execute novamente a prévia.
- Somente depois processe os retornos Bradesco com a quantidade exibida na prévia.
