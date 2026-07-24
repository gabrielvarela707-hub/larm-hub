LARMHUB BACKEND 0.5.7
HOTFIX DA AUDITORIA STRATO X LARMHUB

CAUSA DO ERRO
A estrutura atual da tabela fin_retornos_cobranca armazena o hash na coluna
sha256. A versão 0.5.6 consultava hash_arquivo, coluna inexistente nessa base.

CORREÇÃO
- Detecta automaticamente sha256 ou hash_arquivo.
- Prefere sha256 quando as duas colunas existirem.
- Continua usando transação READ ONLY e ROLLBACK.
- Não possui migration.
- Não altera clientes, contratos, parcelas, baixas ou movimentos.

INSTALAÇÃO
1. Na raiz do backend, faça backup dos arquivos que serão substituídos:

cp scripts/auditar_sincronizacao_strato_larmhub.js \
  /root/auditar_sincronizacao_strato_larmhub.js-antes-0.5.7
cp package.json /root/package.json-antes-0.5.7
cp package-lock.json /root/package-lock.json-antes-0.5.7

2. Extraia este ZIP na raiz do backend:

unzip -o larmhub-backend-0.5.7-hotfix-auditoria-strato.zip -d .

3. Valide:

node --check scripts/auditar_sincronizacao_strato_larmhub.js
npm run test:audit:strato-larmhub

4. Execute novamente, mantendo os caminhos entre aspas:

npm run db:audit:strato-larmhub -- \
  --retorno="/tmp/CB230700 LUCKY .RET" \
  --relatorio="/tmp/RET 23072026 LUCKY.pdf" \
  --saida="/tmp/auditoria-cb230700-lucky"

5. Depois que a auditoria terminar, registre a versão:

npm run db:migrate:system-releases

Não precisa reiniciar o PM2, pois esta atualização altera somente um comando CLI.
