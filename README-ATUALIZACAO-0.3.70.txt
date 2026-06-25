LARMHUB BACKEND 0.3.70 — REGISTRO DO CHANGELOG DAS SETAS DE ORDENAÇÃO

ARQUIVOS ALTERADOS
- src/data/system_releases_seed.js
- data/system_releases_seed.js
- package.json
- package-lock.json

AJUSTES
1. Registra a versão 0.3.70 no changelog do sistema.
2. Sincroniza o seed canônico e a cópia legada.
3. Nenhuma rota, banco operacional, boleto ou regra financeira foi alterada.

APLICAÇÃO
1. Extrair na raiz do backend.
2. Executar node scripts/migrate_system_releases.js.
3. Reiniciar a API somente para refletir a versão técnica exibida.
