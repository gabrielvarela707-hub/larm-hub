LARMHUB FRONTEND 0.3.72 — SETAS VISÍVEIS NOS CABEÇALHOS

Arquivos alterados:
- src/app/(dashboard)/cadastros/clientes/page.tsx
- src/app/(dashboard)/financeiro/fornecedores/page.tsx
- src/data/system_releases_seed.js
- package.json
- package-lock.json

Ajustes:
- Código, Cliente e Categoria exibem ↕ quando não estão ativos.
- A coluna ativa exibe ↑ para crescente e ↓ para decrescente.
- O mesmo comportamento foi aplicado em Fornecedores.
- O seletor de ordenação foi mantido.
- Nenhuma regra de backend ou financeira foi alterada.

Aplicação:
1. Extrair na raiz do frontend.
2. Executar npm ci apenas se necessário.
3. Executar npm run type-check.
4. Executar npm run build.
5. Publicar no Vercel e atualizar com Ctrl + F5.
