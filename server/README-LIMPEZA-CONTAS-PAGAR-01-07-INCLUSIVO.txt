LARMHUB — LIMPEZA DOS LANÇAMENTOS FUT-* EM CONTAS A PAGAR
CORTE INCLUSIVO EM 01/07/2026

OBJETIVO
Limpar os lançamentos importados FUT-* a partir de 01/07/2026, inclusive,
para que o cliente faça os lançamentos manuais desde o primeiro dia de julho.

O QUE SERÁ REMOVIDO
- 987 lançamentos FUT-*;
- 987 parcelas;
- vencimentos de 01/07/2026 até 31/12/2026;
- valor exato validado: R$ 5.187.448,0469.

O QUE SERÁ PRESERVADO
- 12 lançamentos FUT-* com vencimento em 30/06/2026;
- todos os lançamentos que não começam com FUT-*;
- parcelas pagas, baixadas ou vinculadas ao Movimento Bancário;
- todo o Movimento Bancário e o Movimento Orçado.

ARQUIVO DO SEED
Copie para a pasta scripts do backend:
  scripts/seed_limpar_contas_pagar_fut_01_07_inclusivo.js

1. PRÉVIA — NÃO APAGA NADA
  node scripts/seed_limpar_contas_pagar_fut_01_07_inclusivo.js

A prévia correta deve mostrar exatamente:
- 987 lançamentos;
- 987 parcelas;
- valor R$ 5.187.448,0469;
- primeiro vencimento 2026-07-01;
- último vencimento 2026-12-31.

2. EXECUÇÃO
  node scripts/seed_limpar_contas_pagar_fut_01_07_inclusivo.js --execute --confirmar=987

IMPORTANTE
A comparação é inclusiva:
  vencimento >= 2026-07-01

Assim, os 30 lançamentos FUT-* do próprio dia 01/07/2026 também serão removidos.

PROTEÇÕES
- Data fixa em 01/07/2026.
- Validação dos totais exatos encontrados no banco enviado.
- Interrupção automática se a base estiver diferente.
- Confirmação explícita de 987 registros.
- Transação SERIALIZABLE.
- Backup JSON antes da exclusão.
- Nenhuma alteração em frontend, backend, Movimento Bancário ou Movimento Orçado.

ARQUIVOS DE AUDITORIA
- RELATORIO-VALIDACAO-BANCO-01-07-INCLUSIVO.txt
- ALVOS-VALIDADOS-987.csv
