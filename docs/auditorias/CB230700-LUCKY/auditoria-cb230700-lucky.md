# Auditoria preliminar — CB230700 LUCKY

**Modo:** somente leitura. Nenhum dado foi alterado.

## Resultado

- 2 ocorrências não localizadas.
- 0 clientes novos confirmados nesses dois casos.
- 0 contratos novos confirmados nesses dois casos.
- As duas divergências estão nas parcelas/títulos.

## Márcia Beatriz de Oliveira Santos

- Cliente legado 1335 e contrato `STR-1203-B-4` já existem.
- Retorno: parcela `052/120`, vencimento 10/06/2026, principal R$ 1.715,93, juros R$ 58,25 e pago R$ 1.774,18.
- Candidato no LarmHub: `16f548e5-74eb-445c-9b61-61e5e81b800e`, documento `1203 13/30`, mesmo vencimento, valor R$ 1.727,42, status atrasada.
- Diagnóstico: a fração foi importada incorretamente como `13/30`; precisa corrigir documento/fração/valor antes da baixa.

## Briza Lucci Mause

- Cliente legado 1480 e contrato `STR-1366-F-1` já existem.
- O boleto `260000392183` consolida 10 parcelas, de `018/037` a `027/037`.
- As 10 parcelas já existem no LarmHub e estão abertas.
- LarmHub: R$ 2.061,25 por parcela. Strato: R$ 2.073,21 por parcela. Diferença: R$ 11,96 por parcela.
- Total pago: R$ 18.474,79. Rateio técnico em centavos: 9 parcelas de R$ 1.847,48 e 1 parcela de R$ 1.847,47.
- A composição deve ser confirmada no SQL Server antes de qualquer baixa.

| Parcela | Vencimento | ID LarmHub | Valor LarmHub | Valor Strato | Pago rateado |
|---|---|---|---:|---:|---:|
| 018/037 | 2027-06-15 | `c55a7505-fb9e-48a6-a5ec-a61e40fa4ef0` | R$ 2.061,25 | R$ 2.073,21 | R$ 1.847,48 |
| 019/037 | 2027-07-15 | `a168b160-bd17-4173-9cb5-49964f132615` | R$ 2.061,25 | R$ 2.073,21 | R$ 1.847,48 |
| 020/037 | 2027-08-15 | `ba1c506c-e84a-45c8-a653-bb5e8fb4b707` | R$ 2.061,25 | R$ 2.073,21 | R$ 1.847,48 |
| 021/037 | 2027-09-15 | `fa2803bd-d7c1-49ca-b0d2-d29e1911e112` | R$ 2.061,25 | R$ 2.073,21 | R$ 1.847,48 |
| 022/037 | 2027-10-15 | `9a9bbe59-fef8-4fe9-b23c-bb8c12189c55` | R$ 2.061,25 | R$ 2.073,21 | R$ 1.847,48 |
| 023/037 | 2027-11-15 | `621756b2-ebf6-4b72-bce6-b2253d27c20d` | R$ 2.061,25 | R$ 2.073,21 | R$ 1.847,48 |
| 024/037 | 2027-12-15 | `5af98c97-93da-4b84-87cc-6d5916b6741e` | R$ 2.061,25 | R$ 2.073,21 | R$ 1.847,48 |
| 025/037 | 2028-01-15 | `38be5f40-0b33-407b-befb-9fd3e620edad` | R$ 2.061,25 | R$ 2.073,21 | R$ 1.847,48 |
| 026/037 | 2028-02-15 | `4c871fb8-2a0d-4820-b958-af70f4a122c8` | R$ 2.061,25 | R$ 2.073,21 | R$ 1.847,48 |
| 027/037 | 2028-03-15 | `f2dd0d70-d794-4cfd-a6f9-aac8b671d945` | R$ 2.061,25 | R$ 2.073,21 | R$ 1.847,47 |

## Próxima trava

O backup `.bak` foi reconhecido como backup do SQL Server, mas precisa ser restaurado em uma instância SQL Server para consulta confiável. O pacote inclui uma consulta somente leitura para confirmar os controles e a composição antes da criação do lote de correção.