LARMHUB BACKEND 0.3.77
Cash Flow — visão sintética padrão e Saldo Final corrigido

ALTERAÇÕES
- GET /financeiro/cashflow aceita modo=sintetico|analitico.
- O modo padrão é sintético; contas analíticas são retornadas somente quando solicitadas.
- As contas analíticas permanecem demonstrativas e não são somadas aos pais.
- O Saldo Inicial passa a usar a soma das contas bancárias ativas do sistema.
- O Saldo Final é encadeado mês a mês com a estrutura do Cash Flow.
- CP/CR ainda em aberto continuam compondo a projeção futura.
- O total anual da linha SALDO FINAL passa a representar dezembro, não a soma dos 12 saldos.
- O resumo mensal e diário passa a usar o mesmo cálculo correto da tabela.
- Valores antigos importados de Saldo Inicial/Final ficam preservados no banco, mas não são usados na exibição.
- Nenhuma migration de estrutura é necessária.
- Versão técnica atualizada para 0.3.77.

ARQUIVOS ALTERADOS
- src/routes/financeiro.js
- src/data/system_releases_seed.js
- scripts/system_releases_seed.js
- data/system_releases_seed.js
- system_releases_seed.js
- package.json
- package-lock.json

PUBLICAÇÃO
1. Substitua somente os arquivos acima no backend.
2. Execute npm ci.
3. Execute node scripts/migrate_system_releases.js.
4. Reinicie a API, por exemplo: pm2 restart larmhub-api.

NÃO É NECESSÁRIO
- Reimportar o Cash Flow.
- Alterar fin_cashflow_valores manualmente.
- Executar migration de tabela.

VALIDAÇÃO ESPERADA
- A tela abre mostrando apenas contas sintéticas.
- O botão Exibir analíticas libera o terceiro nível.
- O Saldo Final de janeiro deixa de mostrar aproximadamente R$ 294 milhões e
  passa a refletir a posição real, próxima de R$ 9,4 milhões conforme os dados atuais.
