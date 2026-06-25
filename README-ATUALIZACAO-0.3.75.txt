LARMHUB FRONTEND 0.3.75

ALTERAÇÕES
1. Clientes
- Nova aba Histórico dentro do cadastro/visualização do cliente.
- Novo botão de histórico na coluna Ações.
- Exibe contratos, obras, unidades, período, status, parcelas, valores recebidos, em aberto e vencidos.
- Exibe mensagem clara quando o cliente não possui contrato vinculado.

2. Orçamento
- Texto da tela passa a informar a fórmula usada no Saldo Final:
  Saldo Final = Saldo Inicial + Entradas - Saídas.
- A exibição passa a receber do backend os saldos previsto e realizado recompostos mês a mês.

INSTALAÇÃO
1. Extrair este pacote na raiz do frontend.
2. Executar npm ci e npm run build.
3. Publicar no Vercel.
