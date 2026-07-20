LARMHUB — VERSIONADOR 0.3.92

Este pacote atualiza somente o changelog interno do sistema.

VERSÕES REGISTRADAS
- Sistema: 0.3.92
- Frontend: 0.3.92
- Backend: 0.3.91

INSTALAÇÃO NA API
cd /var/www/lotemobile-api
unzip -o /caminho/lotemobile-api-versionador-0.3.92.zip -d /var/www/lotemobile-api
node --check scripts/migrate_system_releases.js
node scripts/migrate_system_releases.js

Não é necessário reiniciar a API porque não houve alteração de rota ou middleware nesta versão.
