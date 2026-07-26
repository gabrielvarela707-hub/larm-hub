LARMHUB BACKEND 0.6.5 — CORRESPONDÊNCIA STRATO POR JUROS, DV E BOLETO REEMITIDO

OBJETIVO
Corrigir casos em que o relatório Strato identifica claramente a parcela, mas o retorno ficava como "Não localizado" porque:
- a fração do Strato é equivalente à fração importada no LarmHub (050/120 = 5/12; 042/120 = 7/20);
- o valor recebido contém juros, moras, seguro, resíduo ou desconto;
- o boleto foi reemitido e possui nosso número diferente do identificador antigo da parcela;
- o mesmo boleto aparece com ocorrência 02 e depois ocorrência 06.

PROTEÇÕES
- Sem migration de banco.
- Casos com alteração financeira são enviados para a conferência inteligente e exigem confirmação no frontend.
- O backend recalcula os dados a partir do RET e do relatório Strato antes de aplicar.
- O identificador bancário antigo é preservado em conciliacao_dados.
- O novo nosso número somente substitui o anterior quando RET e Strato confirmam o mesmo boleto completo.
- A importação do snapshot CSV de novos clientes/contratos/parcelas NÃO faz parte desta versão.

ARQUIVOS ALTERADOS
- src/services/bradescoReturnProcessor.js
- src/services/stratoMultiParcelAnalysisService.js
- src/services/stratoIntelligentApplyService.js
- src/data/system_releases_seed.js
- data/system_releases_seed.js
- package.json
- package-lock.json
- scripts/test_strato_matching_juros.js
- scripts/test_strato_multi_analysis.js
- scripts/test_strato_intelligent_apply.js

INSTALAÇÃO
1. Faça backup dos arquivos alterados.
2. Extraia este ZIP na raiz do backend.
3. Execute:
   node --check src/services/bradescoReturnProcessor.js
   node --check src/services/stratoMultiParcelAnalysisService.js
   node --check src/services/stratoIntelligentApplyService.js
   npm run test:strato-matching
   npm run test:strato-inteligente
   npm run test:strato-apply
   npm run test:retorno-multiparcelas
4. Atualize o changelog usando o mesmo versionador:
   node scripts/migrate_system_releases.js
5. Reinicie:
   pm2 restart larmhub-api --update-env

RESULTADOS ESPERADOS
- Conciliação Strato 0.6.5: DV, boleto reemitido, frações equivalentes, juros/moras e confirmação assistida conferidos.
- Análise inteligente Strato 0.6.5: multiparcelas, descontos, arredondamento, cadastros e bloqueio de escrita conferidos.
- Aplicação inteligente Strato 0.6.5: seleção, transação, descontos, datas, movimentos individuais e bloqueios cadastrais conferidos.
- Changelog atual=0.6.5.

TESTE FUNCIONAL
Use o RET LUCKY verdadeiro correspondente ao relatório RET 07072026 LUCKY. O arquivo CB070700(2).RET anexado nesta conversa é LARM e não corresponde ao PDF LUCKY.
