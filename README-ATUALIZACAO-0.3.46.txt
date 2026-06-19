LARMHUB FRONTEND v0.3.46

CONTAS A RECEBER
- Substitui a tela mockada por uma listagem real de contratos, receitas e parcelas.
- Inicia no primeiro dia do mês atual.
- Para consultar o passado, altere o campo "Vencimento de".
- Filtros: busca, cliente, tipo de receita, obra, período e status.
- Inclui ordenação, paginação, cabeçalho fixo, barra horizontal superior e setas flutuantes.
- Exportação Excel usa os filtros ativos.
- O botão "Novo Lançamento de Receita" permanece visível, mas bloqueado até a definição do formulário.
- Recebimentos conciliados exibem a origem "Conciliação bancária".
- Removido o contador mockado do menu Contas a Receber.

IMPORTANTE
O relatório importado anteriormente contém o saldo em aberto na posição de 01/06/2026.
Parcelas antigas totalmente pagas ainda dependem da importação histórica de ts1_bole/ts1_core.

INSTALAÇÃO
1. Extraia o ZIP na raiz do frontend.
2. Confirme a substituição dos arquivos.
3. Publique novamente na Vercel.
