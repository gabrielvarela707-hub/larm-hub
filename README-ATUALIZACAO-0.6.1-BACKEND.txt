LARMHUB BACKEND 0.6.1
CONTAS A RECEBER — ESTRUTURA PARA RETORNO COM MÚLTIPLAS PARCELAS

OBJETIVO
Criar somente a estrutura de relacionamento necessária para que uma linha do
retorno Bradesco possa ser associada a duas ou mais parcelas discriminadas no
relatório Strato.

ESTA ETAPA NÃO FAZ
- não processa novamente arquivos RET;
- não cria ou altera clientes;
- não cria ou altera contratos;
- não cria ou altera parcelas;
- não executa baixas;
- não cria Movimento Bancário;
- não altera o frontend;
- não modifica a lógica atual do retorno Bradesco.

ESTRUTURA CRIADA
fin_retornos_cobranca_item_parcelas

Cada linha poderá guardar:
- item original do retorno;
- parcela e movimento individual;
- ordem dentro da composição;
- obra, unidade, cliente, contrato, parcela e controle;
- vencimento, recebimento e crédito;
- nominal, juros financeiros, seguro, moras, desconto, resíduo, total, pago e diferença;
- método, confiança, evidências, ação proposta e bloqueio.

SEGURANÇA
- migration transacional e idempotente;
- relacionamentos nascem bloqueados;
- chaves estrangeiras não apagam parcelas ou movimentos;
- conferência usa BEGIN READ ONLY e ROLLBACK;
- rollback recusa excluir a tabela quando houver qualquer dado.

INSTALAÇÃO
1. Faça backup do banco e dos arquivos package.json/package-lock.json.
2. Extraia o ZIP na raiz do backend.
3. Execute:

   node --check scripts/migrate_retorno_multiparcelas.js
   node --check scripts/check_retorno_multiparcelas.js
   node --check scripts/rollback_retorno_multiparcelas.js
   node --check scripts/test_retorno_multiparcelas.js

   npm run test:retorno-multiparcelas
   npm run db:migrate:retorno-multiparcelas
   npm run db:check:retorno-multiparcelas
   npm run db:migrate:system-releases

RESULTADO ESPERADO DO TESTE
Retorno multiparcelas 0.6.1: estrutura, descontos, vínculos e proteções estáticas OK.

RESULTADO ESPERADO DA CONFERÊNCIA EM UMA BASE NOVA
Tabela fin_retornos_cobranca_item_parcelas: OK
Colunas: 35/35 OK
Constraints: 9/9 OK
Índices adicionais: 6/6 OK
Relacionamentos cadastrados: 0
Relacionamentos órfãos: 0

ROLLBACK
Somente antes de existirem dados:

   npm run db:rollback:retorno-multiparcelas

Não é necessário reiniciar o PM2, pois esta versão não altera rotas ou serviços.
