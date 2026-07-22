LARMHUB FRONTEND 0.5.4
RATEIO DE CONTAS A PAGAR — ETAPA 3: TELA DE LANÇAMENTO

PRÉ-REQUISITO
- Backend 0.5.3 instalado e conferido com:
  npm run db:check:rateio-cp-backend
- O resultado deve estar sem inconsistências.

O QUE ESTA ETAPA ENTREGA
- Opção "Dividir entre várias contas" somente em novos lançamentos do CP.
- De 2 a 20 contas bancárias cadastradas e ativas.
- Empresa, conta bancária, percentual e valor para cada parte.
- Alterar o percentual recalcula o valor.
- Alterar o valor recalcula o percentual.
- Botão "Distribuir igualmente" preservando os centavos e os 100%.
- Soma dos percentuais obrigatoriamente igual a 100%.
- Soma dos valores obrigatoriamente igual ao total do documento.
- Bloqueio de conta repetida e de conta pertencente a outra empresa.
- Envio do campo rateios somente quando a opção estiver ativada e somente na criação.
- Lançamentos normais continuam usando o mesmo payload anterior.
- Edição individual de lançamento pertencente a rateio é bloqueada no frontend.

NÃO FAZ PARTE DESTA ETAPA
- Tela de rastreamento do grupo de rateio.
- Badge de rateio na listagem.
- Alteração de backend ou banco de dados.
- Alteração em baixas, parcelas antigas, movimento bancário ou duplicidade.
- Alteração em src/lib/api/financeiro.ts ou outros arquivos compartilhados.

INSTALAÇÃO SEGURA
1. Entre na raiz do frontend atual.

2. Faça backup apenas dos arquivos que serão substituídos:

   tar -czf /root/larmhub-frontend-antes-0.5.4-$(date +%F-%H%M).tar.gz \
     package.json package-lock.json \
     "src/app/(dashboard)/financeiro/pagar/page.tsx"

3. Extraia este ZIP na raiz do frontend:

   unzip -o larmhub-frontend-0.5.4-rateio-etapa-3-lancamento.zip -d .

4. Execute a conferência isolada do rateio:

   npm run test:rateio-cp-frontend

   Resultado esperado:
   Rateio CP frontend: cálculos e proteções estáticas OK.

5. Execute as validações normais do projeto:

   npm run type-check
   npm run build

6. Publique pelo mesmo processo já utilizado no projeto, sem alterar variáveis,
   rotas ou configuração do servidor.

TESTE FUNCIONAL RECOMENDADO
- Criar um documento de R$ 100,00 com 2 contas em 50% / 50%.
- Confirmar que aparecem dois lançamentos de R$ 50,00.
- Criar um documento de R$ 100,00 com 3 contas usando "Distribuir igualmente".
- Confirmar preservação do total de R$ 100,00 e dos 100%.
- Criar um lançamento normal com o rateio desativado e confirmar o fluxo antigo.
- Não realizar baixa durante o primeiro teste; a baixa pode ser validada depois
  que a criação e a listagem forem conferidas.

ROLLBACK
- Utilize o ZIP separado de rollback 0.5.4, ou restaure o backup criado antes
  da instalação.
- Após restaurar, remova o arquivo de teste adicionado:

  rm -f scripts/test_rateio_cp_frontend.js

- Execute novamente:

  npm run type-check
  npm run build

OBSERVAÇÃO
Esta entrega foi preparada sobre o frontend 0.5.1 enviado na conversa. O salto
para 0.5.4 acompanha as etapas já instaladas no backend: 0.5.2 e 0.5.3.
