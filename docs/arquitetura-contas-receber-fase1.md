# Arquitetura do Contas a Receber — Fase 1

## Diagnóstico

A tela atual de **Financeiro > Contas a Receber** ainda usa dados mockados. No banco,
porém, já existem `com_contratos` e `com_parcelas`, criadas para os recebíveis de
venda de lotes. Essas tabelas não devem ser descartadas nem duplicadas.

O relatório legado analisado contém 13.502 linhas de recebíveis, 126 históricos de
clientes, 137 identificações de unidade e três obras principais:

- 7698 — Residencial Santa Clara;
- 7700 — LARM Residencial Santa Clara;
- 7701 — Aluguel CJ 23.

Os tipos encontrados foram: Parcela, Anual, Entrada, Renegociação, Intermediária,
Taxa, Condomínio, Aditivo, Outros e Comissão. Os índices mais presentes são IPCA2,
IGPM2 e valores sem correção representados por R$.

O legado também possui:

- `tb2_pess`: pessoas/clientes;
- `tb2_obra`: obras/empreendimentos;
- `ts1_prod`: produtos, atualmente sem registros no dump analisado;
- `ts1_serv`: catálogo de serviços;
- `ts1_core`: parcelas e valores a receber;
- `ts1_vend`: contratos/vendas, referenciada pela aplicação;
- `ts1_univ`: unidades vinculadas às obras, referenciada pela aplicação.

## Decisão estrutural

Não criar `parcelas_clientes` agora. A tabela `com_parcelas` já possui contrato,
número, vencimento, valor, correção, multa, juros, desconto, status e baixa. Na Fase 2
ela deve ser ampliada, evitando duas fontes de verdade para o mesmo recebimento.

## Relações da Fase 1

```text
cad_pessoas
    └── cad_clientes
            ├── com_contratos
            │       └── com_contrato_itens
            │               ├── cad_produtos
            │               ├── cad_servicos
            │               └── fin_tipos_receita
            └── fin_receitas
                    ├── com_contratos
                    ├── com_contrato_itens
                    ├── cad_produtos
                    ├── cad_servicos
                    └── fin_tipos_receita
```

## Tabelas

### cad_produtos

Catálogo comercial. O campo `tipo` permite produto, obra, empreendimento, unidade,
lote, aluguel, imóvel ou outro. `produto_pai_id` permite organizar, por exemplo,
obra > unidade.

### cad_servicos

Catálogo de serviços faturáveis. Possui código fiscal, item da lista de serviços,
periodicidade padrão e indicação de receita recorrente.

### fin_tipos_receita

Normaliza os componentes financeiros do contrato e preserva os códigos do relatório
legado, como `Par.`, `Ent`, `Ano`, `RENE`, `INT`, `Tax.`, `COND`, `ADT`, `Out.` e
`Com.`.

### com_contratos

A tabela existente é preservada. São adicionados `cliente_id`, título, tipo, datas,
índice de reajuste, origem, código legado, obra e unidade. Os campos `comprador_*`
continuam disponíveis para compatibilidade com as rotas atuais.

### com_contrato_itens

Permite que um contrato tenha vários produtos, serviços e tipos de receita. Exemplo:
um contrato de aluguel pode conter aluguel mensal, condomínio, taxa e reajuste por
índice, todos ligados ao mesmo cliente e contrato.

### fin_receitas

Representa a origem/cabeçalho da receita antes do parcelamento. Pode ser contratual
ou avulsa e fica ligada ao cliente, contrato, item, produto, serviço, tipo de receita
e plano de contas.

## Fase 2 prevista

1. Acrescentar `receita_id` e identificadores legados em `com_parcelas`.
2. Importar contratos de `ts1_vend` e relacioná-los com `cad_clientes`, obras e
   unidades.
3. Importar recebíveis de `ts1_core` e reconciliar com o relatório Excel.
4. Separar valor nominal, correção, resíduo, mora, desconto, seguro, juros e total.
5. Ligar baixas ao Movimento Bancário e ao Cash Flow.
6. Substituir os mocks da tela Contas a Receber pela API real.

## Limites desta versão

- não importa o relatório Excel;
- não cria nem altera parcelas;
- não substitui a tela atual;
- não altera os cálculos do Cash Flow;
- não remove colunas ou tabelas existentes.
