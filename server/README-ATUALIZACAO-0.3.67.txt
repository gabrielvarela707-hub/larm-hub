LARMHUB BACKEND 0.3.67

CORREÇÃO
- Corrige o erro PostgreSQL "inconsistent types deduced for parameter $5" ao clicar em Compartilhar no WhatsApp.
- Corrige a mesma gravação compartilhada usada pelo envio de e-mail.
- Os parâmetros passam a ser tipados uma única vez por meio de CTE antes do INSERT/UPDATE.

PRESERVADO
- Geração de boleto.
- Recálculo e valores.
- Nosso número, linha digitável e código de barras.
- Configurações LARM/LUCKY.
- Remessa CNAB e retorno bancário.

ARQUIVOS ALTERADOS
- src/routes/recebiveis.js
- src/data/system_releases_seed.js
- package.json
- package-lock.json

APLICAÇÃO
1. Extrair o ZIP na raiz do backend.
2. Não executar migration, seed ou npm install.
3. Reiniciar a API:
   pm2 restart larmhub-api
   pm2 logs larmhub-api --lines 100
4. Atualizar a tela com Ctrl+F5 e testar WhatsApp e e-mail.
