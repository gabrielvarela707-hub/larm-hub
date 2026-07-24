LARMHUB API 0.3.93 — LANÇAMENTO MANUAL NO MOVIMENTO BANCÁRIO

Arquivos alterados:
- src/routes/financeiro.js
- src/data/system_releases_seed.js
- data/system_releases_seed.js
- package.json
- package-lock.json

Não há migration de estrutura.

Instalação:
1. Extraia o ZIP na raiz /var/www/lotemobile-api.
2. Execute:
   node --check src/routes/financeiro.js
   node --check src/data/system_releases_seed.js
   node scripts/migrate_system_releases.js
   pm2 restart larmhub-api

Rota criada:
POST /financeiro/movimento/manual

Regras:
- Tarifa bancária: saída, conta DESPESAS BANCARIAS E COMISSOES, natureza 5.2.2.
- Rendimento de aplicação: entrada, conta REND. S/APLICACOES FINANCEIRAS, natureza 5.1.3.
- Empresa e banco vêm da conta selecionada.
- O saldo inicial da conta não é alterado.
- O lançamento recebe tipo_lancamento=manual e aparece após o corte das importações de 2026.
