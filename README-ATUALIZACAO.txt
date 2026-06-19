LARMHUB FRONTEND v0.3.40

Correções e melhorias:
- Corrigido o botão "Voltar ao topo" das setas flutuantes.
- O botão agora retorna primeiro a rolagem interna da tabela para a primeira linha e também retorna a página ao topo.
- Mantidas as setas horizontais já aplicadas em Contas a Pagar, Cash Flow, Orçamento, Movimento Orçado e Movimento Bancário.
- Aplicado o mesmo padrão de navegação em Contas a Receber, Bancos e Contas e Fornecedores.
- Cabeçalhos dessas novas tabelas permanecem visíveis durante a rolagem vertical.
- Nenhuma regra de cálculo, baixa, lançamento, cadastro ou filtro foi alterada.

Instalação:
1. Extraia este ZIP na raiz do frontend.
2. Confirme a substituição dos arquivos.
3. Publique novamente na Vercel.

Arquivos alterados:
- src/components/table-floating-nav.tsx
- src/app/(dashboard)/financeiro/receber/page.tsx
- src/app/(dashboard)/financeiro/bancos/page.tsx
- src/app/(dashboard)/financeiro/fornecedores/page.tsx
- package.json
- package-lock.json
- README-ATUALIZACAO.txt
