LARMHUB BACKEND 0.3.78
Cash Flow — posições mensais e níveis de contas corrigidos

CAUSA IDENTIFICADA
As linhas abaixo de SALDO FINAL são posições mensais, não fluxos. O importador
anterior somava o saldo de todos os dias do mês. Por isso janeiro ficou próximo
de R$ 294 milhões, embora o fechamento correto da planilha seja R$ 9.416.986,47.

A fórmula correta da planilha é:
SALDO FINAL = SALDOS BANCÁRIOS EM C/C + APLICAÇÕES FINANCEIRAS

Janeiro — CONSOLIDADO
- Saldo Inicial: R$ 9.666.473,96
- Saldos Bancários em C/C: R$ 328.152,96
- Aplicações Financeiras: R$ 9.088.833,51
- Saldo Final: R$ 9.416.986,47

ALTERAÇÕES
- Sintético retorna somente contas numéricas de até dois níveis.
- Analítico adiciona o terceiro nível abaixo da respectiva conta sintética.
- Contas analíticas antigas gravadas diretamente na estrutura também são filtradas.
- Removida a soma indevida de posições diárias no Saldo Final mensal.
- SALDO FINAL passa a usar C/C + Aplicações, conforme a planilha original.
- O resumo e os cards usam a mesma posição mensal da tabela.
- CP/CR em aberto continuam nas linhas informativas, mas não são somados novamente
  à posição patrimonial já fechada na planilha.
- O importador passa a usar a coluna de fechamento mensal nas linhas de posição.
- Criado procedimento transacional para corrigir 1.080 valores:
  6 empresas x 15 linhas de posição x 12 meses.
- O procedimento gera backup JSON e valida todos os subtotais antes do COMMIT.
- Versão técnica atualizada para 0.3.78.

ARQUIVOS ALTERADOS
- src/routes/financeiro.js
- scripts/migrate_cashflow_posicoes_2026.js
- scripts/data/cashflow_posicoes_2026.json
- scripts/import_financeiro.py
- src/data/system_releases_seed.js
- scripts/system_releases_seed.js
- data/system_releases_seed.js
- system_releases_seed.js
- package.json
- package-lock.json

PUBLICAÇÃO — ORDEM OBRIGATÓRIA

1. Substitua os arquivos do backend e instale as dependências:

   cd /var/www/lotemobile-api
   npm ci

2. Execute a PRÉVIA. Ela não altera o banco:

   node scripts/migrate_cashflow_posicoes_2026.js

   A prévia deve mostrar:
   - Empresas: 6
   - Linhas de posição: 15
   - Valores validados: 1080
   - Depois | Saldo Final: R$ 9.416.986,47

3. Execute a correção:

   node scripts/migrate_cashflow_posicoes_2026.js --execute --confirmar=1080

   Também pode usar:

   npm run db:migrate:cashflow-posicoes-2026

4. Registre a versão:

   node scripts/migrate_system_releases.js

5. Reinicie a API:

   pm2 restart larmhub-api

SEGURANÇA
- Nenhuma tabela é apagada.
- Somente as 15 linhas de posição do Cash Flow de 2026 são atualizadas.
- Receitas, despesas, investimentos e demais fluxos permanecem intactos.
- É gerado backup em scripts/backups/ antes da atualização.
- A operação usa transação e faz ROLLBACK se algum valor não conferir.
- O procedimento é idempotente: se a base já estiver correta, não altera nada.

VALIDAÇÃO ESPERADA
- Sintético: aparece 4.1, mas não 4.1.1/4.1.2.
- Analítico: aparecem 4.1 e suas contas de terceiro nível.
- Janeiro Consolidado: Saldo Final R$ 9.416.986,47.
- Aplicações Financeiras de janeiro: R$ 9.088.833,51.
