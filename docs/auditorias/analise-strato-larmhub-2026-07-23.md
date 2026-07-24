# Comparação Strato × LarmHub — posição 23/07/2026

## Duas leituras necessárias

### 1. Novidades desde a posição operacional de 01/06/2026

- **2 clientes novos** ainda ausentes no LarmHub.
- **3 contratos novos** assinados após 01/06/2026 e ainda ausentes no LarmHub.
- **383 parcelas** nesses contratos: **3 pagas** e **380 abertas**.

### 2. Diferença do histórico completo do Strato

- O Strato possui **573 cabeçalhos de contrato** que não aparecem na tabela atual de contratos do LarmHub.
- Um deles é o contrato interno `1017`, sem parcelas; portanto há **572 contratos financeiros com parcelas ausentes**.
- Desses, **111 contratos** possuem parcelas abertas/atrasadas e **461** possuem somente histórico pago.
- Esses contratos concentram **41441 parcelas**: **30969 pagas**, **6418 atrasadas** e **4054 abertas**.
- Existem ainda **13 parcelas pagas** sem equivalente único em contratos que já existem no LarmHub.
- **395 registros antigos** ganharam data de recebimento no Strato em relação à cópia legada do dump; a etapa 0.6.2 deve verificar quais já foram conciliados antes de propor ação.

## Clientes novos

- `1501` — **FERNANDO RODRIGUES DA SILVA** — LARM, obra 7700.
- `1502` — **ENZO TOTH BITTENCOURT CEZARINO** — LUCKY, obra 7698.

## Contratos novos desde 01/06/2026

| Contrato | Empresa | Cliente | Unidade | Parcelas | Pagas | Abertas | Primeiro vencimento | Último vencimento |
|---:|---|---|---|---:|---:|---:|---:|---:|
| 1394 | LUCKY | HUDSON FLAVIO MARTINS | J-4 | 171 | 1 | 170 | 30/06/2026 | 30/08/2039 |
| 1395 | LARM | FERNANDO RODRIGUES DA SILVA | M-11 | 171 | 1 | 170 | 08/07/2026 | 08/09/2039 |
| 1396 | LUCKY | ENZO TOTH BITTENCOURT CEZARINO | X-15 | 41 | 1 | 40 | 03/07/2026 | 03/11/2029 |

## Regra de importação

- Os 3 contratos novos podem entrar no fluxo de criação após validação dos valores convertidos.
- Os 111 contratos antigos com saldo aberto não podem ser criados em massa sem uma etapa de classificação, porque podem conter renegociações e séries substituídas.
- Os 461 contratos totalmente pagos devem entrar, quando aprovado, apenas como histórico, sem gerar saldo e sem duplicar Movimento Bancário.
- As 13 lacunas pagas de contratos existentes também devem ser registradas como histórico.
- Para parcelas futuras sem boleto, `core1_val_par` é valor indexado e não é diretamente o valor em reais; a criação deve usar o relatório Strato convertido ou reproduzir a regra oficial de conversão.
