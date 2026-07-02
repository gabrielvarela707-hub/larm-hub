LARMHUB FRONTEND 0.3.78
Cash Flow — separação real entre Sintético e Analítico

CORREÇÃO
A versão 0.3.77 não garantiu o corte visual em todas as situações. A 0.3.78
aplica a regra também no frontend, independentemente de cache ou de linhas
analíticas retornadas por uma estrutura antiga do backend.

ALTERAÇÕES
- O Cash Flow abre no modo SINTÉTICO.
- Sintético exibe somente contas numéricas de até dois níveis:
  4 / 4.1 / 4.2 / 8.7 etc.
- Contas como 4.1.1, 4.1.2 e 8.7.1 ficam ocultas no Sintético.
- Analítico libera explicitamente o terceiro nível.
- Criado seletor separado "Sintético" e "Analítico", evitando ambiguidade no botão.
- O frontend possui filtro defensivo por profundidade da conta.
- O detalhamento dos lançamentos continua disponível ao clicar no valor sintético.
- Versão técnica atualizada para 0.3.78.

ARQUIVOS ALTERADOS
- src/app/(dashboard)/financeiro/cashflow/page.tsx
- src/lib/api/financeiro.ts
- src/data/system_releases_seed.js
- data/system_releases_seed.js
- package.json
- package-lock.json

PUBLICAÇÃO
1. Substitua somente os arquivos do pacote no frontend.
2. Execute npm ci.
3. Execute npm run type-check.
4. Publique normalmente no Vercel.

IMPORTANTE
O backend 0.3.78 e a correção das posições mensais devem ser executados antes
de validar o Saldo Final na tela.
