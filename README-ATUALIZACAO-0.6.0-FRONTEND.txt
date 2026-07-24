LARMHUB FRONTEND 0.6.0
EXIBIÇÃO DE DESCONTO E JUROS NO CONTAS A RECEBER

ESCOPO
- Altera somente a coluna Valor da listagem de Contas a Receber.
- Mantém o valor líquido já usado pelo sistema.
- Quando existir desconto ou juros, mostra abaixo do líquido:
  - valor nominal;
  - desconto com sinal negativo;
  - juros com sinal positivo;
  - valor recebido para parcelas pagas.
- Não altera cálculos, filtros, baixa manual, retorno bancário, APIs ou banco de dados.

EXEMPLOS
BRIZA
  Líquido/recebido: R$ 1.847,48
  Nominal: R$ 2.073,21
  Desconto: -R$ 225,73

MÁRCIA
  Líquido/recebido: R$ 1.774,18
  Nominal: R$ 1.715,93
  Juros: +R$ 58,25

ORDEM DE INSTALAÇÃO
Aplique este frontend somente depois que o backend 0.5.9 for executado e o comando abaixo terminar sem divergências:

  npm run db:check:cb230700-lucky

INSTALAÇÃO
Na raiz do frontend:

  cp package.json /root/frontend-package.json-antes-0.6.0
  cp package-lock.json /root/frontend-package-lock.json-antes-0.6.0
  cp "src/app/(dashboard)/financeiro/receber/page.tsx" /root/receber-page.tsx-antes-0.6.0

  unzip -o larmhub-frontend-0.6.0-desconto-contas-receber.zip -d .

VALIDAÇÃO

  npm run test:cr-discount-display
  npm run type-check
  npm run build

Resultado do teste isolado esperado:

  Contas a Receber 0.6.0: valor líquido, nominal, desconto, juros e recebido ficam visíveis sem alterar cálculos ou ações.

Publique/reinicie o frontend pelo procedimento já usado no ambiente somente depois do build concluir.

ROLLBACK
Extraia o pacote de rollback na raiz do frontend e execute novamente o build:

  unzip -o larmhub-frontend-0.6.0-desconto-contas-receber-rollback.zip -d .
  npm run type-check
  npm run build
