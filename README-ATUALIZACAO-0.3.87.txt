LARMHUB / LOTEMOBILE — CORREÇÃO 0.3.87
Data: 03/07/2026

1. MOVIMENTO BANCÁRIO — 26, 29 E 30/06/2026

Problemas corrigidos:
- O script anterior tratava o resultado `rows` como objeto e gerava undefined.
- Uma segunda versão convertia DATE para UTC no Node e exibia 26 como 25, 29 como 28 e 30 como 29.
- Foram criados quatro lotes duplicados além do lote oficial.

Fonte oficial preservada:
MOV-2026-ATE-0107-20260702020021

Quantidade oficial validada:
- 26/06/2026: 11
- 29/06/2026: 13
- 30/06/2026: 7
- Total: 31

Lotes duplicados validados:
- MOV-2026-20260629-30-0379: 20
- MOV-2026-20260629-30-0383: 20
- MOV-2026-20260626-30-0384: 31
- MOV-2026-20260629-30-0385: 20
- Total provável para remoção: 91

O seed compara todos os campos financeiros com o lote oficial antes de remover.
Também cria backup compactado e redireciona referências por chave estrangeira para o ID oficial.
Qualquer divergência executa ROLLBACK.

Executar no backend:

  cd /var/www/lotemobile-api

  node --check scripts/seed_corrigir_duplicidades_movimento_26_29_30.js

  node scripts/seed_corrigir_duplicidades_movimento_26_29_30.js

A prévia deve mostrar 31 oficiais e, se os quatro lotes ainda estiverem presentes, 91 duplicidades.
Depois executar usando exatamente o número informado pela prévia:

  node scripts/seed_corrigir_duplicidades_movimento_26_29_30.js --execute --confirmar=91

Conferência final:

  node scripts/seed_corrigir_duplicidades_movimento_26_29_30.js

O resultado final deve informar que não há duplicidades e que permanecem 31 movimentos oficiais.


2. RETORNOS BRADESCO — SEED MANUAL

Arquivo recebido e incluído:
- CB030700 Larm 02-07.RET
- Empresa: LARM PARTICIPACOES LTDA
- Ocorrência: 02/07/2026
- Crédito: 03/07/2026
- Valor pago: R$ 1.851,95

Os dois ZIPs recebidos possuem exatamente o mesmo conteúdo e o mesmo SHA-256:
3342ae32a90d53639d6765e47985b9177508d95150f20f7a0b4851761ae0bade

Portanto, somente um retorno LARM único foi incluído. Não havia um arquivo Lucky diferente nesse envio.
O seed ignora arquivos repetidos automaticamente e identifica LARM/LUCKY pelo cabeçalho CNAB.

Prévia:

  cd /var/www/lotemobile-api
  node scripts/seed_processar_retornos_bradesco_2026_07_02.js

Execução, usando o número mostrado pela prévia:

  node scripts/seed_processar_retornos_bradesco_2026_07_02.js --execute --confirmar=N


3. ROTA DO SISTEMA PARA UPLOAD

A rota abaixo continua aceitando o formato antigo de um arquivo e agora também aceita vários arquivos em uma única operação:

POST /financeiro/contas-receber/bradesco/retorno

Novo formato opcional:

{
  "files": [
    { "filename": "LARM.RET", "content": "..." },
    { "filename": "LUCKY.RET", "content": "..." }
  ],
  "baixar_liquidacoes": true
}

A operação é transacional: se um arquivo falhar, nenhum dos arquivos do lote é gravado parcialmente.
A idempotência por hash continua ativa.

A tela de Contas a Receber agora permite selecionar vários arquivos .RET de uma vez e envia o conteúdo em Windows-1252, preservando as 400 posições do CNAB.


ARQUIVOS ALTERADOS

Backend:
- scripts/seed_corrigir_duplicidades_movimento_26_29_30.js
- scripts/seed_processar_retornos_bradesco_2026_07_02.js
- scripts/imports/retornos-2026-07-02/CB030700 Larm 02-07.RET
- scripts/imports/retornos-2026-07-02/README.txt
- src/routes/recebiveis.js

Frontend:
- src/app/(dashboard)/financeiro/receber/page.tsx
