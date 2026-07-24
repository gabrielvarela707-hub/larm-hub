LARMHUB BACKEND — ATUALIZAÇÃO 0.3.42

Alterações:
- Backend passa a aceitar e preservar PIX, Boleto, TED, DOC, Transferência,
  Débito automático, Dinheiro, Cartão e Outro.
- Dados automáticos continuam restritos a PIX, Boleto, TED e DOC.
- Novos arquivos de boleto só são processados quando a modalidade é Boleto.

Instalação:
1. Extrair o conteúdo deste ZIP diretamente em /var/www/lotemobile-api.
2. Não é necessário executar migration de banco nesta versão.
3. Executar:
   node scripts/migrate_system_releases.js
   pm2 restart larmhub-api
