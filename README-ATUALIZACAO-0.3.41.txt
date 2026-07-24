LARMHUB BACKEND v0.3.41

Alterações em Contas a Pagar:
- Adicionadas colunas de modalidade e instruções de pagamento em fin_lancamentos_cp.
- Criada a tabela fin_lancamentos_cp_boletos para vários boletos por lançamento.
- PIX usa a chave do fornecedor como preenchimento padrão e salva uma cópia no lançamento.
- TED/DOC usam os dados bancários do fornecedor como preenchimento padrão e salvam uma cópia no lançamento.
- Boleto aceita linha digitável e vários arquivos PDF/imagem.
- Criado endpoint autenticado para abrir boleto já armazenado.
- O endpoint de fornecedores para selects agora retorna PIX e dados bancários necessários.
- O limite JSON da API foi ampliado para 30MB; cada boleto continua limitado a 6MB e novos boletos a 20MB no total.

Migration obrigatória:
  node scripts/migrate_modalidade_pagamento_cp.js

Depois da migration:
  node scripts/migrate_system_releases.js
  pm2 restart larmhub-api

Versionamento:
- Versão atual: 0.3.41.
- Após 0.3.99, a próxima versão deverá ser 0.4.0.

Arquivos alterados:
- src/routes/fornecedores_bancos.js
- src/server.js
- src/data/system_releases_seed.js
- scripts/migrate_modalidade_pagamento_cp.js
- package.json
- package-lock.json
- README-ATUALIZACAO-0.3.41.txt
