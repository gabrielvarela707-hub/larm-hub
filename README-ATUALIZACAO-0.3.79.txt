LARMHUB FRONTEND 0.3.79
Financeiro — vencimento como primeira coluna

ALTERAÇÕES
- Contas a Pagar (/financeiro/pagar): Vencimento passa a ser a primeira coluna.
- Contas a Pagar legado (/financeiro/contas-pagar): Vencimento também passa a ser a primeira coluna.
- Contas a Receber (/financeiro/receber): Vencimento passa a ser a primeira coluna de dados, logo após a caixa de seleção.
- Mantidos filtros, ordenação, paginação, ações e demais funcionalidades existentes.
- Datas de vencimento e emissão da listagem legada de Contas a Pagar passam a usar o padrão dd/mm/aaaa.
- Versão técnica atualizada para 0.3.79.

ARQUIVOS ALTERADOS
- src/app/(dashboard)/financeiro/pagar/page.tsx
- src/app/(dashboard)/financeiro/contas-pagar/page.tsx
- src/app/(dashboard)/financeiro/receber/page.tsx
- src/lib/api/financeiro.ts
- src/data/system_releases_seed.js
- data/system_releases_seed.js
- package.json
- package-lock.json

PUBLICAÇÃO
1. Substitua somente os arquivos do pacote no frontend.
2. Execute: npm ci
3. Execute: npm run type-check
4. Publique normalmente no Vercel.

VALIDAÇÃO REALIZADA
- npm run type-check: concluído sem erros.
- next build: compilação e validação de tipos concluídas; o processo avançou para coleta de páginas e excedeu o limite do ambiente de teste.
