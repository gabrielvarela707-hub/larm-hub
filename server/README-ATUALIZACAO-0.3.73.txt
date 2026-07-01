# Atualização 0.3.73 — Backend

## Correção

- As rotas de Clientes e Fornecedores agora aplicam corretamente os parâmetros de ordenação.
- Compatibilidade com `ordenar/direcao`, `sort/direction` e `order_by/order_dir`.
- Ordenação por Código, Nome e Categoria é executada no PostgreSQL antes da paginação.
- Respostas de listagem usam `Cache-Control: no-store`.
- Sem migration e sem alteração em boletos ou módulos financeiros.

## Aplicação

```bash
pm2 restart larmhub-api
```

Para atualizar o changelog:

```bash
node scripts/migrate_system_releases.js
```
