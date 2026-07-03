LARMHUB — MOVIMENTO BANCÁRIO 2026 ATÉ 01/07/2026
=================================================

OBJETIVO
Substituir somente o lote importado do Movimento Bancário realizado de 2026,
considerando a planilha do cliente até 01/07/2026.

O PROCEDIMENTO
- remove somente 2.249 registros do lote anterior MOV-2026-20260617220743;
- preserva 11 movimentos criados/vinculados pelo sistema;
- reconcilia 3 linhas da planilha com movimentos já vinculados ao Contas a Pagar;
- insere 2.369 registros da planilha;
- ignora 1.355 linhas posteriores a 01/07/2026;
- não altera Movimento Orçado;
- não altera os lançamentos do Contas a Pagar;
- não altera os vínculos movimento_id existentes;
- gera backup no banco e em scripts/backups/*.json.gz;
- cancela tudo automaticamente se os números do banco divergirem da base analisada.

RESULTADO VALIDADO
- Registros finais em 2026: 2.380
- Entradas finais: R$ 8.524.030,9320
- Saídas finais: R$ 8.528.946,0520
- Saldo líquido: R$ -4.915,1200

INSTALAÇÃO
Copie a pasta scripts deste pacote para a raiz do backend, preservando:

scripts/seed_substituir_movimento_bancario_2026_ate_01_07.py
scripts/imports/movimento-bancario-2026-larmhub-01-07.xlsx

1) VALIDAÇÃO SOMENTE DO ARQUIVO
python3 scripts/seed_substituir_movimento_bancario_2026_ate_01_07.py --validar-arquivo

2) PRÉVIA CONTRA O BANCO — NÃO ALTERA NADA
python3 scripts/seed_substituir_movimento_bancario_2026_ate_01_07.py

A prévia deve terminar com:
Modo prévia: nenhum registro foi alterado.
Após conferir, execute com: --execute --confirmar=2380

3) EXECUÇÃO
python3 scripts/seed_substituir_movimento_bancario_2026_ate_01_07.py --execute --confirmar=2380

IMPORTANTE
- Execute uma única vez.
- Não use a planilha completa com o importador antigo.
- Não renomeie nem edite a planilha do pacote; o script confere o SHA-256.
- Se a base mudou desde o banco analisado, o script interrompe antes de excluir.
- O backup externo será exibido no final da execução.
