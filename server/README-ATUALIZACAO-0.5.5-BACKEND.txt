LARMHUB BACKEND 0.5.5
CONTAS A PAGAR — DADOS DE PAGAMENTO DO FORNECEDOR
Data: 22/07/2026

OBJETIVO
Ajustar a modalidade de pagamento do Contas a Pagar sem alterar rateio,
parcelas, baixas, Movimento Bancário ou lançamentos existentes.

COMPORTAMENTO
- PIX: carrega e grava a chave PIX do fornecedor.
- TED, DOC e Transferência: carregam e gravam banco, código bancário, agência,
  conta, dígito e tipo de conta do fornecedor.
- Boleto: linha digitável e arquivos continuam pertencendo somente ao
  lançamento. Nenhum dado de boleto é gravado no fornecedor.
- O lançamento mantém uma cópia dos dados utilizados no momento do cadastro.
- A atualização do fornecedor ocorre na mesma transação do lançamento. Se o
  lançamento falhar, a alteração do fornecedor também é desfeita.

BANCO DE DADOS
Não existe migration nesta entrega. Os campos necessários já existem.
Não execute qualquer migration estrutural para esta atualização.

ORDEM DE INSTALAÇÃO
Instale primeiro este backend e somente depois o frontend 0.5.5.

INSTALAÇÃO
1. Entre na raiz do backend e faça backup dos arquivos substituídos:

   cd /var/www/lotemobile-api
   tar -czf /root/larmhub-backend-antes-0.5.5-$(date +%F-%H%M).tar.gz \
     package.json package-lock.json \
     src/routes/fornecedores_bancos.js \
     src/data/system_releases_seed.js \
     data/system_releases_seed.js

2. Pare o processo:

   pm2 stop larmhub-api

3. Extraia o pacote na raiz do backend:

   unzip -o larmhub-backend-0.5.5-pagamento-fornecedor.zip -d .

4. Confira sintaxe e teste isolado:

   node --check src/routes/fornecedores_bancos.js
   node --check src/services/contasPagarPagamentoService.js
   node --check scripts/test_pagamento_fornecedor_cp.js
   npm run test:pagamento-fornecedor-cp

   Resultado esperado:
   Pagamento CP: TED, DOC, transferência, PIX e boleto conferidos.

5. Reinicie o backend:

   pm2 restart larmhub-api --update-env
   pm2 status
   pm2 logs larmhub-api --lines 100

6. Após instalar também o frontend 0.5.5, atualize o histórico:

   npm run db:migrate:system-releases

TESTE FUNCIONAL APÓS O FRONTEND
- Fornecedor com chave PIX: selecionar PIX e confirmar preenchimento.
- Alterar a chave, salvar e abrir novamente o fornecedor para confirmar.
- Fornecedor sem chave PIX: preencher no lançamento e confirmar o cadastro.
- Repetir com TED, DOC e Transferência usando banco, agência, conta e dígito.
- Criar boleto e confirmar que a linha digitável não aparece no fornecedor.
- Criar um lançamento comum sem rateio e outro com rateio para conferir que
  os fluxos anteriores continuam funcionando.

ROLLBACK
- Pare o PM2.
- Restaure o backup criado antes da instalação ou use o pacote de rollback.
- Remova os arquivos novos, caso use restauração manual:

   rm -f src/services/contasPagarPagamentoService.js
   rm -f scripts/test_pagamento_fornecedor_cp.js

- Reinicie o PM2.

O rollback de código não precisa desfazer nenhuma migration estrutural, pois
esta atualização não cria nem altera estruturas no banco.
