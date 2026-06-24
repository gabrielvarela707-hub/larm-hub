LARMHUB FRONTEND 0.3.62 — RESTAURAÇÃO DA GERAÇÃO DE BOLETOS

Arquivos alterados:
- src/app/(dashboard)/financeiro/receber/page.tsx
- package.json
- package-lock.json

Correções:
- restaura para um boleto a rota individual que já funcionava: /financeiro/contas-receber/:id/bradesco/boleto;
- mantém a geração em lote quando a rota nova estiver disponível;
- adiciona fallback automático para gerar os títulos individualmente quando o backend responder 404/Rota não encontrada;
- preserva o recálculo acumulado, os valores salvos, a configuração bancária e a remessa;
- não altera o backend nem o banco de dados.
