# Contas a Receber — Fase 2

## Fluxo implementado

```text
cad_clientes
    └── com_contratos
          ├── com_contrato_itens
          │      └── cad_produtos (obra/unidade)
          └── fin_receitas
                 └── com_parcelas
```

## Critério de contrato

O relatório não fornece um cabeçalho contratual separado. Por isso, um contrato é
identificado conservadoramente pela combinação:

- cliente normalizado;
- código da obra;
- código da unidade.

Essa combinação gera 137 contratos para 126 clientes.

## Critério de receita

Dentro de cada contrato, as linhas são agrupadas por natureza:

- Entrada;
- Parcela;
- Anual;
- Renegociação;
- Intermediária;
- Taxa;
- Condomínio;
- Aditivo;
- Outros;
- Comissão.

Cada grupo gera um item de contrato e uma receita. O resultado é 251 receitas.

## Valores das parcelas

`com_parcelas.valor_nominal` recebe a coluna **Total** do relatório para que o
Contas a Receber apresente exatamente o saldo cobrável informado pelo cliente.

A composição é preservada separadamente:

- valor convertido;
- resíduo;
- moras;
- desconto;
- seguro;
- juros de financiamento;
- total do relatório.

## Segurança da importação

- prévia obrigatória antes da execução;
- bloqueio se algum cliente não for encontrado ou tiver vínculo ambíguo;
- índices únicos por origem/código legado;
- reexecução idempotente;
- parcelas já pagas não voltam para aberto;
- contratos quitados não têm valores substituídos.
