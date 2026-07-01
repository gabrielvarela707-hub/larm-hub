LARMHUB BACKEND 0.3.64
========================

Arquivos atualizados:
- src/routes/cadastros.js
- src/routes/recebiveis.js
- src/data/system_releases_seed.js
- package.json
- package-lock.json

Ajustes:
1. GET /cadastros/empresas carrega as empresas existentes em ts1_cemp, com CNPJ e endereço.
2. GET /cadastros/cep/:cep consulta ViaCEP e usa BrasilAPI como fallback, com cache em memória.
3. GET /cadastros/clientes/proximo-codigo retorna o maior código numérico + 1.
4. POST /cadastros/clientes gera o próximo código no backend quando o campo vier vazio, com trava transacional.
5. Mantida a correção 0.3.63 da geração de boleto Bradesco.

Não há migration ou seed obrigatório nesta versão.

Aplicação:
1. Extrair na raiz do backend.
2. Não é necessário npm install.
3. Reiniciar a API:
   pm2 restart larmhub-api
   pm2 logs larmhub-api --lines 100

Ordem recomendada: publicar o backend antes do frontend 0.3.64.
