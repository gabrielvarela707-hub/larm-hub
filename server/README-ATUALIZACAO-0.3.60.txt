LARMHUB BACKEND 0.3.60 — CORREÇÃO DA PRÉVIA DE RECEBÍVEIS

CAUSA CORRIGIDA
A consulta de fin_movimento enviava o parâmetro $1 (tenant), mas na primeira prévia ele não aparecia no SQL quando a tabela de auditoria ainda não existia. O PostgreSQL não conseguia determinar o tipo do parâmetro.

CORREÇÃO
Foi incluído o filtro obrigatório:
  fm.tenant_id = $1::uuid

ARQUIVOS ALTERADOS
- scripts/seed_recebiveis_posicao_2026_06_23.js
- package.json
- package-lock.json
- src/data/system_releases_seed.js

APLICAÇÃO
1. Extrair este pacote na raiz do backend.
2. Executar novamente a prévia:
   npm run db:preview:recebiveis:posicao-2026-06-23 -- --tenant=a1000000-0000-4000-8000-000000000001 --as-of=2026-06-23
3. Conferir os totais apresentados.
4. Somente na base de teste, executar:
   npm run db:seed:recebiveis:posicao-2026-06-23 -- --tenant=a1000000-0000-4000-8000-000000000001 --as-of=2026-06-23
5. Reiniciar a API apenas se o processo web estiver usando os demais arquivos 0.3.59:
   pm2 restart larmhub-api

CONFIGURAÇÃO LUCKY
A configuração deve ser feita no frontend 0.3.59 em Financeiro > Contas a Receber > Bradesco > Empresa LUCKY. Não copie os dados da LARM. Use agência, conta, código de empresa/convênio e beneficiário fornecidos pelo Bradesco para a LUCKY. Deixe homologado desmarcado até o banco aprovar o arquivo de teste.
