LARMHUB BACKEND 0.6.6 — APLICAÇÃO PERSISTENTE DA CONFERÊNCIA STRATO

OBJETIVO
Corrigir o caso em que o frontend mostrava 1 parcela elegível selecionada, mas o backend retornava sucesso com 0 parcelas aplicadas e 0 movimentos criados.

CAUSA
A seleção usava a posição temporária fileIndex:itemIndex:parcelIndex. O backend recalcula a análise antes de gravar; se a ordem dos itens muda, a seleção deixa de corresponder à parcela e a versão 0.6.5 terminava sem escrita e sem erro.

CORREÇÃO
- seleção estável v2 por arquivo + linha CNAB + ID da parcela;
- fallback de identidade por obra + unidade + fração + boleto para parcela ainda ausente;
- seleção não reconhecida cancela a transação com erro explícito;
- frontend antigo com chave posicional é recusado com segurança;
- nenhuma migration;
- nenhuma alteração nas regras financeiras já funcionando.

INSTALAÇÃO
1. Faça backup dos arquivos atuais.
2. Extraia este ZIP na raiz do backend.
3. Execute:

node --check src/services/stratoIntelligentApplyService.js
node --check scripts/test_strato_intelligent_apply.js
npm run test:strato-apply
npm run test:strato-matching
npm run test:strato-inteligente
node scripts/migrate_system_releases.js
pm2 restart larmhub-api --update-env
pm2 status
pm2 logs larmhub-api --lines 100

IMPORTANTE
Publique também o frontend 0.6.6. O backend 0.6.6 rejeita a chave antiga por posição para impedir aplicação incorreta.

TESTE FUNCIONAL
- envie novamente o RET e a crítica Strato correspondentes;
- marque a parcela localizada com divergências;
- clique em Aplicar ajuste e baixa;
- o retorno deve informar 1 parcela aplicada e 1 movimento criado;
- ao reenviar os mesmos arquivos, a parcela deve aparecer como já baixada.
