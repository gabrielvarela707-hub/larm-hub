LARMHUB FRONTEND 0.6.5 — CONFIRMAÇÃO ASSISTIDA STRATO

ALTERAÇÕES
- Exibe o nosso número completo com o dígito verificador na tabela e no PDF.
- Mostra "Correspondência provável" quando cliente, contrato, parcela, vencimento e relatório indicam uma parcela, mas os valores precisam de confirmação.
- Informa se a diferença é acréscimo por juros/moras, desconto ou ajuste provável.
- Mostra as evidências usadas: cliente, contrato, fração equivalente, vencimento e boleto completo.
- O checkbox da conferência inteligente funciona como confirmação explícita para atualizar e baixar.
- Casos sem evidência suficiente continuam bloqueados.

ARQUIVOS ALTERADOS
- src/app/(dashboard)/financeiro/receber/page.tsx
- src/components/financeiro/StratoIntelligentReview.tsx
- package.json
- package-lock.json
- scripts/test_strato_matching_frontend.js
- scripts/test_strato_review_frontend.js
- scripts/test_strato_apply_frontend.js

INSTALAÇÃO
1. Publique primeiro o backend 0.6.5.
2. Faça backup dos arquivos alterados.
3. Extraia este ZIP na raiz do frontend.
4. Execute:
   npm run test:strato-matching-frontend
   npm run test:strato-review
   npm run test:strato-apply-frontend
   npm run type-check
   npm run build
5. Publique somente após type-check e build sem erro.

RESULTADOS ESPERADOS
- Frontend Strato 0.6.5: boleto completo com DV, candidato provável, juros/desconto e confirmação assistida conferidos.
- Frontend Strato 0.6.5: relatório visual, multiparcelas, descontos, divergências, PDF e aplicação selecionada conferidos.
- Frontend Strato 0.6.5: seleção por parcela, aplicação, bloqueios e numeração iniciando em 1 conferidos.
