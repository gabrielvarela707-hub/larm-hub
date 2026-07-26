# LarmHub Backend 0.8.3 — Sincronização cadastral Strato

## Resultado do snapshot recebido

- 61.229 linhas;
- 578 clientes únicos;
- 709 contratos;
- 59.932 parcelas;
- 2 clientes novos em relação ao dump PostgreSQL de 24/07/2026;
- 3 contratos novos desde 01/06/2026;
- 570 contratos históricos ausentes permanecem apenas em auditoria.

### Clientes novos

- 1501 — FERNANDO RODRIGUES DA SILVA — LARM / obra 7700;
- 1502 — ENZO TOTH BITTENCOURT CEZARINO — LUCKY / obra 7698.

### Contratos novos

- 1394 — HUDSON FLAVIO MARTINS — LUCKY — J-4 — 171 parcelas;
- 1395 — FERNANDO RODRIGUES DA SILVA — LARM — M-11 — 171 parcelas;
- 1396 — ENZO TOTH BITTENCOURT CEZARINO — LUCKY — X-15 — 41 parcelas.

## Regra de segurança

Esta versão atualiza apenas cadastro e contratos recentes. Ela não importa parcelas porque `core1_val_par` pode ser valor indexado e não valor monetário em reais.

A rotina:

- preenche somente campos vazios em clientes existentes;
- cria clientes ausentes;
- cria contratos ausentes com data a partir de 01/06/2026;
- não cria parcelas;
- não cria baixa;
- não cria Movimento Bancário;
- não remove dados;
- não exige migration.

## Prévia

```bash
cd /var/www/lotemobile-api
npm run db:preview:strato-cadastros
```

A prévia não altera o banco.

## Execução

```bash
cd /var/www/lotemobile-api
npm run db:sync:strato-cadastros
```

Toda a execução ocorre em uma única transação.
