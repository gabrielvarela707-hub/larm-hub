LARMHUB BACKEND v0.3.34

Alteração:
- Armazena tipo de documento e número do documento por parcela em Contas a Pagar.
- Registros antigos recebem o documento principal do lançamento durante a migration.
- Listagem, pesquisa, filtros, exportação e baixa usam o documento da parcela quando informado.
- Parcelas pagas permanecem protegidas durante a edição.

Instalação:
1. Extraia este ZIP dentro da pasta server/.
2. Execute:

   npm run db:migrate:documentos-parcelas-cp
   node scripts/migrate_system_releases.js
   pm2 restart all

3. Não é necessário reimportar lançamentos ou movimentos.

Arquivos alterados:
- src/routes/fornecedores_bancos.js
- scripts/migrate_documentos_parcelas_cp.js
- data/system_releases_seed.js
- package.json
- package-lock.json
