LARMHUB BACKEND 0.3.61 — FIX DA PRÉVIA DE RECEBÍVEIS
Data: 24/06/2026

ERRO CORRIGIDO
- column fm.tenant_id does not exist

CAUSA
- A tabela legada fin_movimento é global e não possui a coluna tenant_id.
- O tenant existe em com_parcelas e na tabela de auditoria fin_recebiveis_atualizacao_teste.

CORREÇÃO
- Removido o filtro inválido fm.tenant_id.
- Consulta parametrizada dinamicamente:
  $1 = data inicial
  $2 = data final
  $3 = históricos aceitos
  $4 = tenant somente quando a auditoria já existe
- Nenhuma estrutura de banco foi alterada.

VALIDAÇÃO
- Estrutura conferida no dump PostgreSQL atual.
- JavaScript validado com node --check.
- package.json e package-lock.json validados.

EXECUÇÃO
1. Extrair na raiz do backend /var/www/lotemobile-api.
2. Rodar novamente apenas a prévia:

npm run db:preview:recebiveis:posicao-2026-06-23 -- \
  --tenant=a1000000-0000-4000-8000-000000000001 \
  --as-of=2026-06-23

3. Somente após conferir a prévia, executar:

npm run db:seed:recebiveis:posicao-2026-06-23 -- \
  --tenant=a1000000-0000-4000-8000-000000000001 \
  --as-of=2026-06-23
