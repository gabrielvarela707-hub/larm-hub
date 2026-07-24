LARMHUB FRONTEND 0.7.4
Busca na tabela e coluna Valor recebido

ARQUIVO ALTERADO
- src/app/(dashboard)/financeiro/receber/page.tsx

ALTERAÇÕES
1. Busca visível imediatamente acima da tabela de Contas a Receber.
2. Pesquisa automática com espera de 350 ms para evitar uma requisição a cada tecla.
3. A busca usa o endpoint/filtro existente e considera cliente, CPF/CNPJ, contrato, receita, documento, obra e unidade.
4. A coluna "Valor" passa a mostrar o valor original da parcela (valor_nominal).
5. Nova coluna "Valor recebido" após "Valor".
6. "Valor recebido" usa valor_pago, que é o valor efetivamente vinculado à baixa e ao Movimento Bancário.
7. Quando houver diferença, a tela mostra o acréscimo ou desconto em relação ao valor original.
8. Nenhuma alteração em backend, banco de dados, baixa, retorno bancário ou Movimento Bancário.

APLICAÇÃO
Copie o arquivo do pacote preservando a estrutura de pastas sobre o projeto frontend e publique novamente na Vercel.

NÃO É NECESSÁRIO
- migration
- npm install
- alteração no backend
