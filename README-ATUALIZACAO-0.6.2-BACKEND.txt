LARMHUB BACKEND 0.6.2
ANÁLISE INTELIGENTE STRATO + RETORNO BRADESCO + LARMHUB

OBJETIVO
Esta etapa adiciona a análise genérica, somente leitura, para reconhecer:
- uma linha CNAB relacionada a uma ou várias parcelas;
- desconto, juros financeiros, seguro, moras, resíduo, total pago e diferença;
- frações equivalentes, como 052/120 = 13/30;
- cliente, contrato ou parcela ausente;
- parcela localizada com valor, vencimento ou fração divergente;
- parcela já baixada;
- diferença de um centavo causada pelo arredondamento do relatório impresso.

SEGURANÇA
- Esta versão não cria clientes, contratos ou parcelas.
- Esta versão não executa baixas nem cria Movimento Bancário pelo novo analisador.
- Casos simples de uma linha para uma parcela continuam no fluxo que já funcionava.
- Casos com várias parcelas, descontos, divergências ou cadastros ausentes são
  bloqueados antes da gravação e retornados para revisão.
- A aplicação pelo frontend será liberada somente na etapa 0.6.4.
- Não há migration de banco nesta entrega; a estrutura 0.6.1 deve estar instalada.

VERSIONAMENTO
O nome e o caminho do versionador NÃO foram alterados:
  node scripts/migrate_system_releases.js

O package.json mantém:
  npm run db:migrate:system-releases

A fonte canônica src/data/system_releases_seed.js e a cópia de compatibilidade
em data/system_releases_seed.js foram sincronizadas. Após a instalação, o
versionador deve informar atual=0.6.2.

ARQUIVOS ALTERADOS
- package.json
- package-lock.json
- src/services/stratoReturnReportAnalyzer.js
- src/services/stratoMultiParcelAnalysisService.js
- src/routes/recebiveis.js
- src/data/system_releases_seed.js
- data/system_releases_seed.js
- scripts/test_strato_multi_analysis.js
- scripts/test_retorno_multiparcelas.js

INSTALAÇÃO
1. Faça backup dos arquivos atuais:

cd /var/www/lotemobile-api
mkdir -p /root/larmhub-backup-0.6.2
cp package.json package-lock.json /root/larmhub-backup-0.6.2/
cp src/routes/recebiveis.js /root/larmhub-backup-0.6.2/
cp src/services/stratoReturnReportAnalyzer.js /root/larmhub-backup-0.6.2/
cp src/data/system_releases_seed.js /root/larmhub-backup-0.6.2/
cp data/system_releases_seed.js /root/larmhub-backup-0.6.2/

2. Extraia o pacote na raiz do backend:

unzip -o larmhub-backend-0.6.2-analise-inteligente-strato.zip -d .

3. Valide a sintaxe:

node --check src/services/stratoReturnReportAnalyzer.js
node --check src/services/stratoMultiParcelAnalysisService.js
node --check src/routes/recebiveis.js
node --check scripts/test_strato_multi_analysis.js
node --check scripts/migrate_system_releases.js

4. Execute os testes isolados:

npm run test:strato-inteligente
npm run test:retorno-multiparcelas
npm run test:fix:cb230700-lucky

Resultado principal esperado:
Análise inteligente Strato 0.6.2: multiparcelas, descontos, arredondamento, cadastros e bloqueio de escrita conferidos.

5. Atualize o changelog usando o mesmo arquivo de sempre:

npm run db:migrate:system-releases

O log esperado deve conter:
Changelog: ... versões carregadas de src/data/system_releases_seed.js; atual=0.6.2

6. Reinicie a API, pois esta etapa altera rota e serviços:

pm2 restart larmhub-api --update-env
pm2 status
pm2 logs larmhub-api --lines 100

TESTE FUNCIONAL SEGURO
Na tela atual do retorno, envie o RET e o relatório Strato com a opção de apenas
prévia/sem baixa. A resposta passa a conter:
  data.analise_inteligente
ou, em lote:
  data.arquivos[n].analise_inteligente

Para um boleto com várias parcelas, a análise informa:
- quantidade_parcelas;
- data_recebimento do relatório;
- data_credito bancário;
- nominal, desconto, juros, moras, resíduo e pago por parcela;
- cliente, contrato e parcela encontrados ou ausentes;
- divergências;
- ajuste de arredondamento documentado;
- bloqueios e ação proposta.

Se a tela antiga tentar baixar diretamente um caso complexo, a API responde HTTP
409 com requires_review=true e a análise completa. Nenhuma baixa é executada.

IMPORTANTE
- Não remova scripts/migrate_system_releases.js.
- Não renomeie o versionador.
- Não reexecute a migration 0.6.1 como rollback.
- Esta entrega não é a tela visual Strato; essa será a etapa 0.6.3.
