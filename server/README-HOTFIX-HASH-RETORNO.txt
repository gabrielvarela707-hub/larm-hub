HOTFIX 0.5.9 — HASH DO RETORNO CB230700 LUCKY

Causa:
O arquivo .RET original usa quebras de linha CRLF e possui SHA-256
185e23c6a7b003be8e20cfc9df98dd975a3d751359180b776b7c37edabdbfcba.
O processador Bradesco normaliza as quebras para LF antes de calcular e
armazenar o hash no PostgreSQL. O hash normalizado correto é
c2d5b7958f67fb467a1ea0b79f1f0b7ac5806563160e0336945963310b52af75.

Este hotfix altera somente o hash esperado no plano da correção e reforça
o teste. Não modifica dados financeiros, parcelas, movimentos ou retornos.

Aplicação:
  unzip -o larmhub-backend-0.5.9-hotfix-hash-retorno.zip -d .
  npm run test:fix:cb230700-lucky
  npm run db:fix:cb230700-lucky

Somente após a prévia correta:
  npm run db:fix:cb230700-lucky -- --execute --confirmar=11
