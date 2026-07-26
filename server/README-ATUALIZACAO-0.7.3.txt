LARMHUB BACKEND 0.7.3 — CORREÇÃO DA APLICAÇÃO STRATO

CAUSA EXATA
O analisador retorna as linhas na propriedade "itens".
O serviço de aplicação estava percorrendo somente "items".
Por isso nenhuma linha da análise era processada e as seleções 3 e 12 terminavam como não correspondentes, embora o RET e os UUIDs estivessem corretos.

ALTERAÇÃO
- Passa a usar analysis.itens.
- Mantém fallback para analysis.items.
- Não altera regras financeiras, banco de dados ou frontend.
- Não exige migration nem npm install.

INSTALAÇÃO RECOMENDADA
cd <pasta extraída>
bash instalar-0.7.3.sh

INSTALAÇÃO EXPLÍCITA NO SERVIDOR INFORMADO
LARMHUB_BACKEND_DIR=/var/www/lotemobile-api APP_NAME=lotemobile-api bash instalar-0.7.3.sh

VALIDAÇÃO
O instalador verifica diretamente que as linhas 3 e 12 são lidas por getAnalysisItems({ itens: [...] }) antes de reiniciar o PM2.
