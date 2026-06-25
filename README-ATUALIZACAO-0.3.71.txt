LARMHUB FRONTEND 0.3.71 — RESTAURAÇÃO DO PACKAGE NEXT.JS

CAUSA CONFIRMADA
O log do Vercel mostrou "engines: node >=18.0.0", metadado existente no package.json do backend (larmhub-api), não no frontend.
Por isso o Vercel instalou dependências do backend e informou que não encontrou o Next.js.

ARQUIVOS DESTE PACOTE
- package.json
- package-lock.json
- src/data/system_releases_seed.js

APLICAÇÃO
Extraia SOMENTE na raiz do repositório FRONTEND, onde existem next.config.js e src/app.
Não extraia no backend.

VALIDAÇÃO ANTES DO COMMIT
node -p "require('./package.json').name"
Resultado esperado: larmhub-web

node -p "require('./package.json').dependencies.next"
Resultado esperado: ^15.3.0

npm ci
npx next --version
npm run type-check
npm run build

VERCEL
Root Directory deve apontar para a pasta que contém:
- package.json com name=larmhub-web
- next.config.js
- src/app

Não houve alteração funcional nas telas, boletos, recebíveis ou APIs.
