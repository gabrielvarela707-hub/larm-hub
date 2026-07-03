LARMHUB 0.3.81 CUMULATIVA

Este pacote contém as alterações acumuladas das versões 0.3.79, 0.3.80 e 0.3.81.

Inclui:
- Vencimento como primeira coluna em Contas a Pagar e Contas a Receber.
- Seeds dos movimentos bancários de 29 e 30/06 e da limpeza do Contas a Pagar.
- Inativação auditada do Movimento Orçado.
- Baixa manual no Contas a Receber.
- Correção da importação de retorno Bradesco CNAB 400 para títulos importados do Strato.
- Prévia sem gravação, conciliação segura, baixa da parcela e criação do Movimento Bancário.
- Procedimento controlado para os retornos de 30/06 e 01/07/2026.

Use este pacote quando a versão 0.3.79 ou 0.3.80 não tiver sido publicada integralmente.

Para os retornos Bradesco, execute primeiro:

  node scripts/migrate_retorno_bradesco_strato.js
  node scripts/seed_processar_retornos_bradesco_ate_2026_07_01.js

Depois use --execute --confirmar=N, sendo N a quantidade exata mostrada pela prévia.
