LARMHUB WEB 0.3.74 — RESTAURA LISTAGENS DE CLIENTES E FORNECEDORES

Arquivos alterados:
- src/app/(dashboard)/cadastros/clientes/page.tsx
- src/app/(dashboard)/financeiro/fornecedores/page.tsx
- src/data/system_releases_seed.js
- package.json
- package-lock.json

Correção:
- remove o cabeçalho Cache-Control das requisições de listagem, evitando bloqueio CORS;
- remove parâmetros duplicados sort/direction;
- mantém ordenar/direcao e as setas clicáveis;
- não altera backend, banco ou regras financeiras.
