LARMHUB BACKEND 0.7.1 — UUID + LINHA FÍSICA DO RET

OBJETIVO
Corrigir definitivamente a aplicação da conferência Strato. A parcela escolhida pelo operador é identificada pelo UUID existente na chave v2 e a composição financeira é obtida da linha física correspondente do arquivo CNAB400 .RET.

O QUE FOI CORRIGIDO
- Seleções com UUID não são mais consumidas por candidatas recalculadas.
- A linha indicada na chave v2 é localizada diretamente em parsed.details.lineNumber.
- Se a análise reorganizar a numeração, o vínculo usa boleto completo + ocorrência + fração do documento.
- Boletos repetidos no mesmo RET são separados pela ocorrência (ex.: 02 entrada confirmada e 06 liquidação normal).
- O ID selecionado pelo operador continua sendo o único ID atualizado.
- Valor nominal, vencimento, documento, cliente, contrato, obra e unidade permanecem preservados.
- Ajusta somente juros/moras, desconto, seguro, resíduo, valor recebido, baixa e Movimento Bancário.

ARQUIVOS DO CASO TESTADOS
- CB070700 (1)(3).RET
- RET 07072026 LUCKY_(4).pdf
- chaves das linhas 3 e 12 informadas pelo frontend

RESULTADO DOS TESTES
- Linha 3: boleto 260000389859, ocorrência 06, UUID 070d73e5-43ba-497c-8d4d-b5328f391168.
- Linha 12: boleto 260000392175, ocorrência 06, UUID 28d25ea5-feb6-4c13-a871-0b634057c81f.
- O registro duplicado do boleto 260000392175 na ocorrência 02 não é usado no lugar da liquidação da linha 12.
- test:strato-apply: OK
- test:strato-matching: OK
- test:strato-inteligente: OK

INSTALAÇÃO
1. Faça backup do backend atual.
2. Extraia este ZIP na raiz do backend 0.7.0, preservando a estrutura de pastas.
3. Reinicie o processo:
   pm2 restart larmhub-api --update-env

Não executar migration.
Não executar npm install.
Não é necessário atualizar o frontend.
