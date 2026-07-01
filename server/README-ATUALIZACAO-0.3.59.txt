LARMHUB BACKEND 0.3.59 — CONTAS A RECEBER / BOLETOS / POSIÇÃO 23-06-2026

1) Aplicar os arquivos na raiz do backend.

2) Caso a versão 0.3.58 ainda não tenha sido aplicada, conferir e executar primeiro a reconciliação LARM/LUCKY:
   npm run db:preview:recebiveis:obras-empresas -- --tenant=a1000000-0000-4000-8000-000000000001 --as-of=2026-06-23
   npm run db:seed:recebiveis:obras-empresas -- --tenant=a1000000-0000-4000-8000-000000000001 --as-of=2026-06-23

3) Executar a migration de comunicação e retorno:
   npm run db:migrate:recebiveis-comunicacao

4) Conferir a atualização da base de teste:
   npm run db:preview:recebiveis:posicao-2026-06-23 -- --tenant=a1000000-0000-4000-8000-000000000001 --as-of=2026-06-23

5) Somente na base de TESTE, aplicar as baixas aproximadas dos movimentos agregados:
   npm run db:seed:recebiveis:posicao-2026-06-23 -- --tenant=a1000000-0000-4000-8000-000000000001 --as-of=2026-06-23

6) Reiniciar a API:
   pm2 restart larmhub-api

IMPORTANTE SOBRE A POSIÇÃO 23/06/2026
- O relatório importado está posicionado em 01/06/2026.
- O seed usa entradas do Movimento Bancário de 02/06 a 23/06 com históricos "Liquidação de cobrança" e "Vendas PMT".
- Esses movimentos não identificam individualmente o cliente. Por isso, o seed é exclusivo para homologação e grava origem_baixa=atualizacao_teste_movimento.
- Primeiro tenta combinação exata por valor. Sem combinação, aplica FIFO nas parcelas mais antigas que cabem no valor agregado.
- O contrato STR-1334-O-14 (Valério) é protegido da baixa aproximada para preservar as parcelas 30/04 e 30/05 no teste do recálculo acumulado.
- Cada vínculo fica auditado em fin_recebiveis_atualizacao_teste e conciliacao_dados.

AJUSTES FUNCIONAIS
- Recálculo pode incluir todas as parcelas anteriores em aberto do contrato, calculando correção, multa e mora por vencimento.
- Mantém um boleto/nosso número por parcela para preservar CNAB e retorno.
- Geração de vários boletos selecionados em um único HTML de impressão.
- Envio em lote por e-mail via AWS SES, com registro de status e data.
- WhatsApp prepara links com linha digitável; sem API oficial configurada, o sistema não afirma entrega.
- Remessa Bradesco permanece separada por empresa.
- Retorno pode aplicar a baixa automaticamente ou apenas registrar a liquidação pendente.

CENÁRIO DE VALIDAÇÃO — VALÉRIO EM 23/06/2026
- Contrato protegido no seed: STR-1334-O-14, obra 7698 / LUCKY, unidade O-14.
- Parcelas vencidas preservadas para teste: 30/04/2026 e 30/05/2026.
- O recálculo acumulado não soma os valores em um único título: calcula cada vencimento pelo seu período real e apresenta o total conjunto.
- Com os índices e parâmetros atuais da base analisada (multa 2% e mora 1% ao mês), a simulação aproximada encontrada foi:
  * 30/04/2026: R$ 1.271,47
  * 30/05/2026: R$ 1.211,09
  * Total acumulado: R$ 2.482,56
- O valor final no servidor pode variar se os índices, multa, mora ou data de cálculo forem alterados.

PRÉVIA ESPERADA DO SEED DE HOMOLOGAÇÃO
- LARM: movimentos agregados de junho em torno de R$ 49.536,29.
- LUCKY: movimentos agregados de junho em torno de R$ 91.986,30.
- Na simulação sobre o dump enviado, foram selecionadas aproximadamente 28 parcelas LARM (R$ 42.789,76) e 66 parcelas LUCKY (R$ 90.715,12).
- Diferenças não conciliadas permanecem registradas e NÃO geram baixa parcial inventada.
- A prévia real executada no servidor é a fonte definitiva antes da aplicação.

