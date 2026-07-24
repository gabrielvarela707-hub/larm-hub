LarmHub API 0.3.90 — Orçamento sem lançamentos inativados

Correção incluída
- O Orçamento Mensal passa a recalcular o PREVISTO diretamente dos registros ativos de fin_orcamento_movimento.
- Lançamentos inativados deixam de compor receitas, despesas, investimentos, subtotais e Saldo Final.
- O recálculo é automático na próxima consulta da tela; não é necessário executar seed financeiro.
- Nenhum lançamento é apagado por esta atualização.

Instalação em /var/www/lotemobile-api

1. Backup:
   cp src/routes/financeiro.js src/routes/financeiro.js.bak-0390
   cp src/data/system_releases_seed.js src/data/system_releases_seed.js.bak-0390
   cp package.json package.json.bak-0390
   cp package-lock.json package-lock.json.bak-0390

2. Extrair o ZIP na raiz da API.

3. Validar:
   node --check src/routes/financeiro.js
   node --check src/data/system_releases_seed.js
   node --check scripts/migrate_system_releases.js

4. Atualizar o versionador:
   node scripts/migrate_system_releases.js

5. Reiniciar:
   pm2 restart larmhub-api
   pm2 logs larmhub-api --lines 50

6. Conferir a versão:
   node -e "console.log(require('./package.json').version)"

Resultado esperado: 0.3.90

7. Abrir novamente o Orçamento ou usar Ctrl+F5.

Não rode novamente a importação do Orçamento.
