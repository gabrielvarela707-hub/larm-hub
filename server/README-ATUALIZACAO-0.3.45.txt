LARMHUB 0.3.45 — CORREÇÃO DE CLIENTES INATIVOS NA IMPORTAÇÃO DE RECEBÍVEIS

ALTERAÇÃO
- O seed de contratos, receitas e parcelas passa a localizar clientes ativos e inativos.
- O status do cliente não é alterado.
- A execução continua bloqueada para nomes realmente ausentes ou ambíguos.

ATUALIZAÇÃO
1. Extraia este pacote na raiz de /var/www/lotemobile-api.
2. Execute a prévia:
   node scripts/seed_recebiveis_relatorio_strato.js --preview --tenant=a1000000-0000-4000-8000-000000000001
3. Confirme que Clientes não localizados = 0.
4. Execute:
   node scripts/seed_recebiveis_relatorio_strato.js --execute --tenant=a1000000-0000-4000-8000-000000000001
5. Registre a versão:
   node scripts/migrate_system_releases.js

Não há migration de banco nesta versão.
