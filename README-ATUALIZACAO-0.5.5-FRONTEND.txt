LARMHUB FRONTEND 0.5.5
CONTAS A PAGAR — MODALIDADE E DADOS DO FORNECEDOR
Data: 22/07/2026

PRÉ-REQUISITO
Backend 0.5.5 instalado e reiniciado.
O arquivo abaixo já deve existir na base atual do frontend:

  src/components/financeiro/BancoSearchSelect.tsx

ESCOPO
- Remove da abertura do CP os campos antigos “Banco para Pagamento” e
  “Conta cadastrada”.
- PIX exibe somente a chave do fornecedor.
- TED, DOC e Transferência exibem Banco, Agência, Conta e Dígito.
- Os campos são preenchidos pelo cadastro do fornecedor e podem ser corrigidos.
- Boleto continua exibindo linha digitável e anexos.
- Após salvar, a lista local de fornecedores é atualizada para que o próximo
  lançamento já utilize os dados informados.

NÃO ALTERADO
- Rateio por contas bancárias.
- Parcelas, retenções e valores.
- Baixa e cancelamento de baixa.
- Listagem, filtros e exportação.
- Movimento Bancário.

INSTALAÇÃO
1. Entre na raiz do frontend e faça backup:

   tar -czf /root/larmhub-frontend-antes-0.5.5-$(date +%F-%H%M).tar.gz \
     package.json package-lock.json \
     "src/app/(dashboard)/financeiro/pagar/page.tsx"

2. Confira o componente necessário:

   test -f src/components/financeiro/BancoSearchSelect.tsx \
     && echo "BancoSearchSelect: OK"

3. Extraia o pacote na raiz do frontend:

   unzip -o larmhub-frontend-0.5.5-pagamento-fornecedor.zip -d .

4. Execute os testes:

   npm run test:pagamento-fornecedor-cp-frontend
   npm run test:rateio-cp-frontend
   npm run type-check
   npm run build

   Resultado esperado do teste novo:
   Pagamento CP frontend: campos antigos removidos e modalidades conferidas.

5. Publique pelo procedimento já utilizado no ambiente.

TESTES FUNCIONAIS
1. Abra um novo lançamento e confirme que não aparecem os campos antigos
   Banco para Pagamento e Conta cadastrada.
2. Selecione um fornecedor e PIX. Confirme a chave automática.
3. Altere a chave, salve e abra um novo lançamento para o mesmo fornecedor.
4. Teste TED, DOC e Transferência. Confirme Banco, Agência, Conta e Dígito.
5. Teste fornecedor sem dados bancários; os campos devem iniciar vazios.
6. Preencha, salve e confirme que o próximo lançamento traz os dados.
7. Teste Boleto e confirme que linha digitável e arquivos continuam normais.
8. Faça um lançamento normal e um lançamento rateado para conferir regressão.

ROLLBACK
Restaure o backup ou extraia o pacote de rollback 0.5.5 na raiz do frontend.
Depois remova o teste novo, se necessário:

  rm -f scripts/test_pagamento_fornecedor_cp_frontend.js

Execute novamente:

  npm run test:rateio-cp-frontend
  npm run type-check
  npm run build
