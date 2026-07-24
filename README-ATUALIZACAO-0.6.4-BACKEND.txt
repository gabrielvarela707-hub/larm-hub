LARMHUB BACKEND 0.6.4 — APLICAÇÃO INTELIGENTE STRATO
======================================================

OBJETIVO
Libera a aplicação controlada da conferência Strato criada nas versões 0.6.1 a
0.6.3. O backend recalcula a análise a partir do RET e do relatório anexado e
executa apenas as parcelas elegíveis selecionadas no frontend.

REGRAS PRINCIPAIS
- Uma linha do retorno pode ser relacionada a uma ou várias parcelas.
- Cada parcela aprovada gera uma baixa e um Movimento Bancário individual.
- A data da baixa e do movimento vem do recebimento no relatório Strato.
- A data de crédito bancário fica preservada nos metadados de auditoria.
- Nominal, J.FCT, seguro, moras, desconto, resíduo, total e recebido são
  preservados separadamente.
- Parcela ausente pode ser criada somente quando cliente e contrato existentes
  foram identificados de forma única.
- Cliente ou contrato ausente/ambíguo permanece bloqueado. O relatório de
  retorno não contém dados suficientes para criar um cadastro contratual
  completo com segurança.
- O backend ignora valores enviados pelo navegador e recalcula tudo antes de
  gravar.
- A execução ocorre em uma transação única. Qualquer falha desfaz toda a
  operação.
- FOR UPDATE e advisory lock protegem contra baixa/movimento duplicado em
  requisições concorrentes.
- Não há migration nova. A estrutura 0.6.1 precisa estar instalada e conferida.

PRÉ-REQUISITO
O comando abaixo já deve terminar sem erros:
  npm run db:check:retorno-multiparcelas

BACKUP
cd /var/www/lotemobile-api
mkdir -p /root/larmhub-backup-0.6.4
cp package.json package-lock.json /root/larmhub-backup-0.6.4/
cp src/routes/recebiveis.js /root/larmhub-backup-0.6.4/
cp src/services/stratoMultiParcelAnalysisService.js /root/larmhub-backup-0.6.4/
cp src/data/system_releases_seed.js /root/larmhub-backup-0.6.4/
cp data/system_releases_seed.js /root/larmhub-backup-0.6.4/

INSTALAÇÃO
1. Extraia o ZIP na raiz do backend:
   unzip -o larmhub-backend-0.6.4-aplicacao-inteligente-strato.zip -d .

2. Valide a sintaxe:
   node --check src/services/stratoIntelligentApplyService.js
   node --check src/services/stratoMultiParcelAnalysisService.js
   node --check src/routes/recebiveis.js
   node --check scripts/test_strato_intelligent_apply.js
   node --check scripts/migrate_system_releases.js

3. Execute os testes:
   npm run test:strato-inteligente
   npm run test:retorno-multiparcelas
   npm run test:strato-apply
   npm run test:fix:cb230700-lucky

Resultados principais esperados:
   Análise inteligente Strato 0.6.4: ... conferidos.
   Retorno multiparcelas 0.6.1: ... OK.
   Aplicação inteligente Strato 0.6.4: ... conferidos.

4. Atualize o changelog com o mesmo versionador já existente:
   node scripts/migrate_system_releases.js

O log deve indicar atual=0.6.4. O nome do arquivo não foi alterado.

5. Reinicie a API:
   pm2 restart larmhub-api --update-env
   pm2 status
   pm2 logs larmhub-api --lines 100

TESTE FUNCIONAL
- Envie o RET e o relatório Strato correspondente pela tela de Contas a
  Receber.
- Revise as parcelas elegíveis.
- Clique em Aplicar ajustes e baixas e confirme a operação.
- Confira que cada parcela recebeu seu próprio movimento e que desconto,
  juros/moras e valor recebido continuam separados.

RETORNO CB230700 LUCKY JÁ CORRIGIDO
Ao reenviar esse retorno específico, Márcia e Briza devem aparecer como já
baixadas. Nenhuma nova baixa deve ser criada e não deve haver parcela elegível
para reaplicação.
