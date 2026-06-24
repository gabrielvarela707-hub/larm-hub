LARMHUB BACKEND v0.3.38

Alterações:
- Criada a tabela comum cad_pessoas para os dados regulares de clientes e fornecedores: documentos, e-mails, telefones e endereço.
- Criada a tabela cad_clientes ligada a cad_pessoas por chave estrangeira.
- Adicionada a chave pessoa_id em fin_fornecedores, preservando as colunas antigas para compatibilidade.
- Fornecedores já cadastrados são vinculados à tabela comum e não são apagados.
- O seed compara primeiro CPF/CNPJ, depois nome normalizado e nome canônico.
- Em fornecedores existentes, o seed preenche somente campos vazios; dados já preenchidos não são sobrescritos.
- Criada API de Clientes com listagem, pesquisa, cadastro, edição e inativação.
- Alterações futuras de fornecedores também sincronizam a tabela comum cad_pessoas.
- Adicionada permissão cadastros_clientes aos perfis.
- Bases limpas incluídas no pacote: 904 clientes e 268 fornecedores consolidados a partir de STR9820, STR8124 e banco legado.

Instalação:
1. Extraia este ZIP na raiz do projeto, mantendo a pasta server/.
2. Execute, nesta ordem:

   node server/scripts/migrate_cadastros_pessoas_clientes.js
   node server/scripts/seed_cadastros_clientes_fornecedores.js --preview
   node server/scripts/seed_cadastros_clientes_fornecedores.js --execute
   node server/scripts/migrate_system_releases.js
   pm2 restart larmhub-api

3. O modo --preview faz a simulação sem gravar dados. A migration e o seed são idempotentes e podem ser executados novamente.

Arquivos alterados:
- server/src/server.js
- server/src/routes/cadastros.js
- server/src/routes/fornecedores_bancos.js
- server/src/services/cadastroPessoaService.js
- server/scripts/migrate_cadastros_pessoas_clientes.js
- server/scripts/seed_cadastros_clientes_fornecedores.js
- server/scripts/imports/cadastros-clientes-str9820.json
- server/scripts/imports/cadastros-fornecedores-str8124.json
- server/scripts/seed_profiles.js
- server/data/system_releases_seed.js
- server/package.json
- server/package-lock.json
