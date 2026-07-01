LARMHUB API 0.3.68 — CORREÇÃO DO CHANGELOG
============================================================

CAUSA IDENTIFICADA
------------------
O script scripts/migrate_system_releases.js carregava:

  ../data/system_releases_seed

Esse arquivo permanecia parado na versão 0.3.56. As atualizações recentes
estavam sendo gravadas em:

  src/data/system_releases_seed.js

Por isso o comando terminava normalmente, mas reaplicava apenas o histórico
antigo e mantinha a versão 0.3.56 como atual.

CORREÇÃO
--------
- A migration agora usa src/data/system_releases_seed.js como fonte canônica.
- A cópia data/system_releases_seed.js foi sincronizada para compatibilidade.
- Foram consolidadas as versões recentes até 0.3.68.
- A migration valida versões duplicadas e informa a versão marcada como atual.
- Adicionado o comando npm run db:migrate:system-releases.

ARQUIVOS ALTERADOS
------------------
scripts/migrate_system_releases.js
src/data/system_releases_seed.js
data/system_releases_seed.js
package.json
package-lock.json

INSTALAÇÃO
----------
1. Extraia este ZIP na raiz do backend:

   /var/www/lotemobile-api

2. Execute a migration:

   node scripts/migrate_system_releases.js

   ou:

   npm run db:migrate:system-releases

3. A saída deve informar:

   Changelog: 74 versões carregadas ... atual=0.3.68
   Changelog aplicado: ... atual=0.3.68

4. Reinicie a API para atualizar também a versão do package.json em memória:

   pm2 restart larmhub-api

5. Atualize a tela com Ctrl + F5.

CONFERÊNCIA NO POSTGRESQL
------------------------
SELECT version, title, released_at, is_current
FROM hub_system_releases
ORDER BY released_at DESC, created_at DESC
LIMIT 15;

SELECT version, title
FROM hub_system_releases
WHERE is_current = true;

O segundo SELECT deve retornar somente a versão 0.3.68.

OBSERVAÇÃO
----------
Nenhuma tabela operacional, recebível, boleto, remessa, retorno ou cálculo
financeiro foi alterado por esta atualização.
