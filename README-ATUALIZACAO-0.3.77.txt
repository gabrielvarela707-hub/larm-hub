LARMHUB FRONTEND 0.3.77
Cash Flow — visão sintética padrão e Saldo Final corrigido

ALTERAÇÕES
- O Cash Flow abre por padrão no modo SINTÉTICO.
- Contas analíticas deixam de poluir a listagem principal.
- Criado botão "Exibir analíticas" / "Ocultar analíticas".
- O detalhe dos lançamentos continua disponível ao clicar no valor sintético.
- O frontend envia o parâmetro modo=sintetico|analitico para a API.
- Cards e tabela passam a consumir o mesmo Saldo Final calculado pelo backend.
- Versão técnica atualizada para 0.3.77.

ARQUIVOS ALTERADOS
- src/app/(dashboard)/financeiro/cashflow/page.tsx
- src/lib/api/financeiro.ts
- src/data/system_releases_seed.js
- data/system_releases_seed.js
- package.json
- package-lock.json

PUBLICAÇÃO
1. Substitua somente os arquivos acima no frontend.
2. Execute npm ci.
3. Execute npm run type-check.
4. Publique normalmente no Vercel.

OBSERVAÇÃO
O backend 0.3.77 deve ser publicado junto para que o filtro sintético/analítico
e o novo cálculo do Saldo Final sejam aplicados.
