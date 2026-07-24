# Estudo — importação inteligente de fornecedores a partir do Movimento Bancário

## Objetivo

Criar, futuramente, uma rotina segura para identificar fornecedores a partir dos lançamentos do Movimento Bancário, sem exigir CNPJ/CPF no primeiro momento.

A ideia é criar cadastros iniciais apenas com o nome provável do fornecedor e permitir que o time atualize depois os dados completos, como CNPJ/CPF, CEP, contato, banco, agência, conta e PIX.

## Regra proposta para a primeira fase

1. Ler os movimentos importados em `fin_movimento`.
2. Priorizar o campo `fornecedor` quando estiver preenchido.
3. Quando `fornecedor` estiver vazio, avaliar o início do campo `historico`, especialmente quando houver padrão com separador `_`, por exemplo:
   - `Nome do fornecedor_descrição do pagamento`
4. Criar uma lista de candidatos, não fornecedores definitivos.
5. Agrupar nomes parecidos antes de gravar em `fin_fornecedores`.
6. Exibir/gerar uma etapa de revisão antes da criação definitiva.

## Normalização sugerida

Para evitar duplicados, cada nome deve gerar uma chave normalizada:

- transformar em minúsculas;
- remover acentos;
- remover pontuação excessiva;
- remover espaços duplicados;
- padronizar termos jurídicos, como `LTDA`, `Ltda.`, `S/A`, `SA`, `ME`, `EPP`;
- remover sufixos operacionais que não sejam parte do nome;
- preservar o nome original mais completo como sugestão principal.

Exemplo:

| Nome bruto | Chave normalizada |
|---|---|
| Sul America Companhia de Seguro Saude | sul america companhia seguro saude |
| Sul América Saúde ref.01/2022 | sul america saude |
| Contjet Serviços Contábeis Ltda. | contjet servicos contabeis |

## Tabela intermediária recomendada

Antes de gravar direto em `fin_fornecedores`, criar uma tabela de candidatos:

```sql
CREATE TABLE fin_fornecedor_candidatos (
  id SERIAL PRIMARY KEY,
  nome_original TEXT NOT NULL,
  nome_normalizado TEXT NOT NULL,
  nome_sugerido TEXT NOT NULL,
  origem VARCHAR(30) DEFAULT 'movimento_bancario',
  total_ocorrencias INTEGER DEFAULT 1,
  primeiro_movimento DATE,
  ultimo_movimento DATE,
  valor_total NUMERIC(15,2),
  status VARCHAR(20) DEFAULT 'pendente',
  fornecedor_id INTEGER REFERENCES fin_fornecedores(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_fornecedor_candidatos_nome_normalizado
  ON fin_fornecedor_candidatos(nome_normalizado);
```

Status sugeridos:

- `pendente`: ainda não revisado;
- `aprovado`: pode virar fornecedor;
- `vinculado`: já foi ligado a um fornecedor existente;
- `ignorado`: não deve virar fornecedor;
- `duplicado`: deve ser agrupado com outro candidato.

## Seed inicial de fornecedores

Após revisão, o fornecedor poderia ser criado assim:

```sql
INSERT INTO fin_fornecedores (
  tipo_pessoa,
  razao_social,
  nome_fantasia,
  categoria,
  empresa,
  ativo
)
VALUES (
  'PJ',
  :nome_sugerido,
  :nome_sugerido,
  'Não classificado',
  'TODOS',
  true
);
```

Campos como CNPJ/CPF, CEP, e-mail, telefone e dados bancários ficariam vazios para atualização posterior.

## Como evitar repetidos

Para movimentos, continuar usando importação por ano com `--ano=AAAA --limpar`, porque isso apaga somente o ano importado e evita duplicar movimentos do mesmo período.

Para fornecedores, não criar direto a partir de cada movimento. Primeiro agrupar por `nome_normalizado`, depois revisar.

Em uma fase futura, pode ser criada uma chave/hash de importação para movimentos, composta por:

- data;
- empresa;
- banco;
- entrada;
- saída;
- fornecedor;
- histórico;
- NF/DOC.

Isso permitiria importação incremental sem depender apenas da limpeza por ano.

## Fluxo recomendado para implementação futura

1. Importar movimentos por ano.
2. Rodar rotina de extração de candidatos a fornecedor.
3. Gerar tela ou relatório de revisão.
4. Permitir aprovar, ignorar, juntar duplicados ou vincular a fornecedor existente.
5. Criar fornecedores aprovados com dados mínimos.
6. Atualizar `fin_movimento.fornecedor_id` quando o vínculo estiver confiável.
7. Permitir enriquecimento manual dos dados cadastrais depois.

## Fora do escopo desta versão

Esta versão não altera cadastro de fornecedores, tela de fornecedores, banco de fornecedores ou vínculo automático com movimentos.

O objetivo agora é apenas documentar o caminho seguro para não criar fornecedores errados ou duplicados.
