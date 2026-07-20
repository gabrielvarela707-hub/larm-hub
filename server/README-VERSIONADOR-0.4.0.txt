Versionador 0.4.0

Registra no hub_system_releases a atualização visual do frontend para exportação em PDF do resultado do retorno Bradesco.

Regra de versionamento daqui em diante:
- usar somente um dígito no patch;
- sequência: 0.4.0, 0.4.1, 0.4.2 ... 0.4.9;
- depois de 0.4.9, a próxima versão será 0.5.0;
- não usar versões como 0.3.102.

Instalação:
unzip -o lotemobile-api-versionador-0.4.0.zip -d /var/www/lotemobile-api
node --check scripts/migrate_system_releases.js
node --check src/data/system_releases_seed.js
node scripts/migrate_system_releases.js
