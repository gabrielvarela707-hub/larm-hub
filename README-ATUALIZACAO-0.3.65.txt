LARMHUB BACKEND 0.3.65

Correção aplicada
- Restaura a gravação simples da emissão de boleto que funcionava anteriormente.
- Remove jsonb_build_object da emissão individual, emissão em lote e atualização da remessa.
- Corrige definitivamente o erro PostgreSQL 42P18: could not determine data type of parameter $3.

Arquivos alterados
- src/routes/recebiveis.js
- src/data/system_releases_seed.js
- package.json
- package-lock.json

Instalação
1. Extraia este ZIP na raiz do backend.
2. Não execute migration, seed ou npm install.
3. Reinicie a API:
   pm2 restart larmhub-api
   pm2 logs larmhub-api --lines 100

Validação rápida no servidor
- Conferir versão:
  node -p "require('./package.json').version"
- Conferir se a rota antiga foi restaurada:
  grep -n "WHERE id=\\$3::uuid AND tenant_id=\\$4::uuid" src/routes/recebiveis.js

Versão esperada: 0.3.65
