LARMHUB BACKEND 0.3.75

ALTERAÇÕES
1. Cadastro de clientes
- Novo endpoint GET /cadastros/clientes/:id/historico.
- Retorna contratos, obras, unidades e situação das parcelas do cliente.
- Resumo com contratos, unidades, recebido, em aberto e vencido.
- Clientes sem contratos retornam histórico vazio, sem criar dados fictícios.

2. Orçamento
- Saldo Inicial, Saldo Final e Saldos Bancários em C/C são recompostos em tempo de consulta.
- Fórmula aplicada por mês: Saldo Final = Saldo Inicial + Entradas - Saídas.
- A recomposição é feita separadamente para Previsto (fin_orcamento_movimento) e Realizado (fin_movimento).
- O lançamento 8.12 Brasil Agro II e todos os demais movimentos do mês passam a participar explicitamente do saldo.

DIAGNÓSTICO DA BASE ENVIADA
- Saldo previsto de abril/2026: R$ 8.958.908,24.
- Movimento líquido previsto de maio/2026: -R$ 532.867,37.
- Saldo final previsto de maio/2026: R$ 8.426.040,87.
- O lançamento Brasil Agro II de R$ 334.987,72 já estava incluído no previsto.
- A falha encontrada era a ausência de recomposição/exibição do Saldo Final realizado.
- Saldo final realizado calculado para maio/2026 na base enviada: R$ 9.997.275,66.

INSTALAÇÃO
1. Extrair este pacote na raiz do backend.
2. Executar:
   node scripts/migrate_system_releases.js
   pm2 restart larmhub-api
3. Não há migration estrutural e não há seed operacional.
