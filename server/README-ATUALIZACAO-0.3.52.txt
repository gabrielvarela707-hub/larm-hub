LARMHUB BACKEND — v0.3.52

Correção e diagnóstico da geração de boleto Bradesco.

- Validação explícita de configuração e dados do cliente.
- Mensagens de erro detalhadas.
- Boleto usa o valor final recalculado.
- Nenhuma migration de banco.

Após extrair na raiz da API:
node scripts/migrate_system_releases.js
pm2 restart larmhub-api
