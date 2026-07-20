LarmHub API 0.3.91 — correção do limite de requisições

CAUSA
- O rate limit global estava configurado para apenas 100 requisições por 15 minutos por IP.
- O middleware era aplicado antes de todas as rotas, inclusive /auth/login e /auth/refresh.
- Ao preencher Contas a Pagar, a SPA podia ultrapassar 100 chamadas e receber HTTP 429.
- Se a página recarregasse ou o token precisasse ser renovado, /auth/refresh também recebia 429; o frontend então limpava a sessão e o formulário não salvo desaparecia.

ALTERAÇÃO
- Limite global padrão: 1000 requisições por 15 minutos por IP.
- /auth/* e /health/* não entram no limite global.
- Login continua protegido por limite próprio: 10 tentativas sem sucesso em 15 minutos.
- Login correto não consome o limite de falhas.
- Nenhuma tabela ou dado financeiro é alterado.

INSTALAÇÃO
1. Fazer backup:
   cp src/middleware/rateLimiter.js src/middleware/rateLimiter.js.bak-0391
   cp src/data/system_releases_seed.js src/data/system_releases_seed.js.bak-0391
   cp package.json package.json.bak-0391
   cp package-lock.json package-lock.json.bak-0391

2. Extrair o ZIP na raiz da API.

3. Verificar variáveis atuais:
   grep -E '^(RATE_LIMIT_MAX|RATE_LIMIT_WINDOW_MS|AUTH_RATE_LIMIT_MAX|AUTH_RATE_LIMIT_WINDOW_MS)=' .env || true

   Se RATE_LIMIT_MAX estiver definido como 100, alterar para:
   RATE_LIMIT_MAX=1000
   RATE_LIMIT_WINDOW_MS=900000

4. Validar:
   node --check src/middleware/rateLimiter.js
   node --check src/data/system_releases_seed.js
   node --check scripts/migrate_system_releases.js

5. Atualizar o versionador:
   node scripts/migrate_system_releases.js

6. Reiniciar a API para limpar os contadores que estão em memória:
   pm2 restart larmhub-api
   pm2 logs larmhub-api --lines 50

7. Conferir a versão:
   node -e "console.log(require('./package.json').version)"
   Resultado esperado: 0.3.91
