LARMHUB FRONTEND v0.3.38

Alterações:
- O grupo "Cadastros Auxiliares" passa a se chamar "Cadastros" e foi movido para cima do Financeiro.
- Fornecedores agora aparece dentro de Cadastros, mantendo a tela já existente.
- Adicionada a tela de Clientes com pesquisa, paginação, cadastro, edição e inativação.
- Adicionada a permissão independente "cadastros_clientes" na configuração de perfis.
- As rotas de Clientes e Fornecedores em Cadastros passam pela validação de permissão.

Instalação:
1. Extraia este ZIP na raiz do frontend.
2. Confirme a substituição dos arquivos.
3. Publique novamente na Vercel.

Arquivos alterados:
- src/components/sidebar.tsx
- src/app/(dashboard)/cadastros/fornecedores/page.tsx
- src/app/(dashboard)/cadastros/clientes/page.tsx
- src/app/(dashboard)/configuracoes/page.tsx
- src/lib/module-access.ts
- src/lib/permissions.ts
- src/hooks/usePermission.ts
- package.json
- package-lock.json
