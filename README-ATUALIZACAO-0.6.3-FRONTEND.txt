LARMHUB FRONTEND 0.6.3 — CONFERÊNCIA INTELIGENTE STRATO
========================================================

OBJETIVO
Exibir no Contas a Receber a análise gerada pelo backend 0.6.2 quando o
retorno Bradesco e o relatório Strato exigem revisão. Esta etapa é somente
visual e não libera aplicação financeira.

ALTERAÇÕES
- Trata a resposta HTTP 409 requires_review sem reduzir o resultado a uma
  mensagem de erro.
- Mostra cada título do retorno em um grupo expansível.
- Mostra uma ou várias parcelas relacionadas ao mesmo boleto.
- Usa colunas semelhantes ao relatório Strato: Obra, Unidade, Parcela,
  Boleto, Vencimento, A pagar, J.FCT, Seguro, Moras, Desconto, Resíduo,
  Total, Recebimento, Pago e Diferença.
- Mostra a correspondência encontrada no LarmHub, divergências, confiança e
  ação proposta.
- Mostra clientes, contratos ou parcelas ausentes.
- Mostra a evidência de ajustes de arredondamento.
- Permite exportar/imprimir a conferência em PDF.
- Mantém o botão de aplicação desabilitado até a versão 0.6.4.

ARQUIVOS FUNCIONAIS ALTERADOS
- src/app/(dashboard)/financeiro/receber/page.tsx
- src/components/financeiro/StratoIntelligentReview.tsx (novo)

INSTALAÇÃO
1. Faça backup dos arquivos atuais.
2. Extraia o ZIP na raiz do frontend.
3. Execute:

   npm run test:strato-review
   npm run type-check
   npm run build

4. Publique/reinicie o frontend somente se os comandos terminarem sem erro.

TESTE FUNCIONAL
- Anexe o RET e o relatório Strato correspondente.
- Mantenha "Baixar liquidações" marcado.
- O backend 0.6.2 responderá que o caso requer revisão.
- A tela deve abrir o quadro "Conferência inteligente Strato", e não apenas
  mostrar uma mensagem de erro.
- Expanda o boleto da Briza e confirme as dez parcelas e seus descontos.

SEGURANÇA
- Nenhum endpoint de aplicação foi adicionado.
- Nenhum cliente, contrato, parcela, baixa ou movimento é criado pela tela.
- O botão de aplicação está propositalmente desabilitado.
