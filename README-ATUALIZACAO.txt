LARMHUB FRONTEND v0.3.37

Alterações:
- Adicionado indicador visual nas células de detalhe do Cash Flow que incluem valores em aberto do Contas a Pagar.
- Ao passar o mouse sobre o valor ou indicador, o sistema mostra a composição entre realizado e Contas a Pagar em aberto.
- A legenda informa que os valores em aberto são considerados pela data de vencimento.
- Ao clicar na célula de detalhe, o modal apresenta tanto os movimentos realizados quanto as parcelas em aberto correspondentes.
- Mantidas as setas de navegação horizontal, barras de rolagem e botão Voltar ao topo da versão anterior.

Instalação:
1. Extraia este ZIP na raiz do frontend.
2. Confirme a substituição dos arquivos.
3. Publique novamente na Vercel.

Arquivos alterados:
- src/app/(dashboard)/financeiro/cashflow/page.tsx
- package.json
- package-lock.json
