LARMHUB WEB 0.3.57

CORREÇÃO
- Corrige o build do frontend bloqueado pelo ESLint.
- O diretório src/routes contém uma rota legada do backend e passa a ser ignorado somente pela análise do frontend.
- Remove imports de ícones não utilizados nas telas de Reservas e Sidebar.
- Nenhuma funcionalidade financeira, rota de API ou regra de negócio foi alterada.

ARQUIVOS ALTERADOS
- eslint.config.mjs
- src/app/(dashboard)/reservas/page.tsx
- src/components/sidebar.tsx
- src/data/system_releases_seed.js
- package.json
- package-lock.json

ATUALIZAÇÃO
- Extraia este ZIP na raiz do frontend e publique novamente na Vercel.
