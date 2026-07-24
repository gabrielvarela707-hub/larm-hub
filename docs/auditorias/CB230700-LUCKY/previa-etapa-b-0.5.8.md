# Prévia da Etapa B — CB230700 LUCKY

Base analisada: backup PostgreSQL `lotemobile_prod (10).zip`, posição de 23/07/2026, combinado com a auditoria 0.5.7 enviada pelo servidor.

> Esta prévia não altera dados. O resultado definitivo deve ser gerado pelo comando 0.5.8 no PostgreSQL atual.

## Correção necessária na auditoria 0.5.7

O driver PostgreSQL devolve campos `date` como objetos JavaScript `Date`. A versão anterior aplicava `String(valor).slice(0, 10)`, transformando datas como `2026-07-26` em `Sun Jul 26`. Isso impediu a correspondência por vencimento de registros que já existiam.

A versão 0.5.8 converte as datas para `YYYY-MM-DD` dentro da consulta SQL e também possui uma normalização defensiva em JavaScript.

## Resultado esperado da simulação

| Grupo | Quantidade | Ação |
|---|---:|---|
| Liquidações analisadas | 6 | Conferência integral |
| Já conciliadas | 4 | Nenhuma alteração |
| Propostas pendentes | 2 | Somente plano, sem execução |
| Parcelas nas propostas | 11 | 1 da Márcia e 10 da Briza |
| Movimentos propostos | 2 | Um por título recebido |
| Valor total proposto | R$ 20.248,97 | R$ 1.774,18 + R$ 18.474,79 |
| Clientes a criar | 0 | Nenhum |
| Contratos a criar | 0 | Nenhum |

## Registros já conciliados — não tocar

1. Luiz Guilherme — Z1-3, movimento 102849.
2. Luiz Guilherme — Z1-4, movimento 102850.
3. Hosana Maura — movimento 102847.
4. Dayana Aparecida — movimento 102848.

Mesmo que a fração local seja diferente do documento exibido no Strato em alguns desses casos, o retorno já está ligado a uma parcela paga e ao Movimento Bancário. A simulação classifica esses registros como `JA_CONCILIADO_SEM_ACAO`.

## Proposta 1 — Márcia Beatriz

- Contrato: `STR-1203-B-4`.
- Parcela atual localizada por vencimento: ID `16f548e5-74eb-445c-9b61-61e5e81b800e`.
- Fração atual: `13/30`.
- Fração Strato: `052/120`.
- Vencimento: `10/06/2026`.
- Nominal atual: R$ 1.727,42.
- Nominal Strato: R$ 1.715,93.
- Juros recebidos: R$ 58,25.
- Valor pago: R$ 1.774,18.

Alterações que a futura etapa de execução poderá aplicar, após confirmação no SQL Server: corrigir a fração, atualizar o nominal, registrar os juros, baixar a parcela e criar/vincular o movimento de R$ 1.774,18.

## Proposta 2 — Briza Lucci Mause

- Contrato: `STR-1366-F-1`.
- Parcelas: `018/037` até `027/037`.
- Todas as dez parcelas já existem e estão abertas no LarmHub.
- Nominal local por parcela: R$ 2.061,25.
- Nominal Strato por parcela: R$ 2.073,21.
- Total nominal local: R$ 20.612,50.
- Total nominal Strato: R$ 20.732,10.
- Diferença nominal: R$ 119,60.
- Total recebido: R$ 18.474,79.
- Desconto total estimado: R$ 2.257,31.
- Distribuição do recebido: nove parcelas de R$ 1.847,48 e a última de R$ 1.847,47.

A proposta permanece bloqueada por `CONFIRMAR_COMPOSICAO_NO_SQLSERVER`. Nenhuma baixa consolidada deve ser executada antes dessa confirmação.

## Segurança

- A simulação abre `BEGIN TRANSACTION READ ONLY`.
- O encerramento é sempre `ROLLBACK`.
- Os parâmetros `--execute`, `--aplicar` e `--confirmar` são recusados.
- Não há código de `INSERT`, `UPDATE` ou `DELETE` na Etapa B.
