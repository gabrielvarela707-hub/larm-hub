LARMHUB BACKEND 0.5.3
CONTAS A PAGAR — RATEIO — ETAPA 2 (BACKEND)
Data: 22/07/2026

OBJETIVO
Ativar somente o backend necessário para cadastrar um documento do Contas a
Pagar dividido entre duas ou mais contas bancárias/empresas.

PRÉ-REQUISITO OBRIGATÓRIO
A versão 0.5.2 — Rateio Etapa 1 deve estar instalada e conferida com sucesso.
Esta atualização depende das estruturas:
- fin_cp_rateios
- fin_cp_rateio_itens
- fin_lancamentos_cp.rateio_id

ESCOPO DESTA ENTREGA
- Backend 0.5.3.
- Nenhum arquivo do frontend foi alterado.
- Nenhum lançamento antigo é convertido ou atualizado.
- O formulário atual continua enviando o payload antigo e funcionando como hoje.
- A tela visual do rateio será entregue separadamente na próxima etapa.

COMPORTAMENTO DO RATEIO
Quando o campo "rateios" não é enviado ou é enviado como lista vazia, a rota
POST /financeiro/lancamentos-cp mantém o fluxo anterior.

Quando "rateios" contém itens, o backend:
1. exige de 2 a 20 contas bancárias ativas e distintas;
2. identifica a empresa pela conta bancária selecionada;
3. exige percentuais somando exatamente 100%;
4. exige valores somando exatamente o valor total do documento;
5. confere se o percentual e o valor de cada parte correspondem entre si;
6. divide todas as parcelas em centavos, preservando os totais;
7. cria um lançamento individual para cada conta;
8. vincula todos os lançamentos ao mesmo documento/grupo;
9. grava grupo, lançamentos, parcelas e vínculos em uma única transação.

EXEMPLO DO NOVO CAMPO DA API

"rateios": [
  {
    "banco_conta_id": 1,
    "percentual": 60,
    "valor": 600.00
  },
  {
    "banco_conta_id": 2,
    "percentual": 40,
    "valor": 400.00
  }
]

O campo "empresa" dentro de cada item é opcional. Quando enviado, ele é
conferido contra a empresa cadastrada na conta bancária. A conta bancária é a
fonte oficial da empresa do lançamento.

RASTREAMENTO
- A listagem de CP passa a retornar metadados rateio_id, rateio_ordem,
  rateio_percentual, rateio_valor, rateio_valor_total e rateio_total_itens.
- O detalhe de um lançamento retorna o grupo completo em "rateio".
- Nova rota: GET /financeiro/lancamentos-cp/:id/rateio
- Documento e boletos do grupo podem ser consultados a partir de qualquer parte.

PROTEÇÕES
- Documento normal continua bloqueado quando fornecedor + tipo + número já existe.
- Um novo grupo também não pode repetir um documento existente.
- A repetição é permitida exclusivamente entre lançamentos do mesmo rateio.
- A edição isolada de uma parte fica bloqueada nesta etapa.
- A exclusão remove o grupo completo e somente é permitida sem baixa/movimento.
- A exclusão bloqueia grupo, lançamentos e parcelas durante a conferência para
  evitar corrida com uma baixa simultânea.
- O rollback do trigger é recusado caso já exista qualquer dado de rateio.

INSTALAÇÃO SEGURA
Execute no servidor do backend, após confirmar que a etapa 0.5.2 está correta.
Substitua /caminho/do/backend pelo diretório real.

1. Faça primeiro um dump/snapshot do banco de produção pelo procedimento já
usado no servidor. Depois entre no diretório do backend e faça o backup dos
arquivos que serão substituídos:

cd /caminho/do/backend
tar -czf ../larmhub-backend-antes-0.5.3.tar.gz \
  package.json package-lock.json \
  src/routes/fornecedores_bancos.js \
  src/data/system_releases_seed.js \
  data/system_releases_seed.js

2. Pare temporariamente o processo para que o código novo não carregue antes da
migration:

pm2 stop larmhub-api

3. Extraia o ZIP da atualização sobre a raiz do backend, preservando as pastas:

unzip -o larmhub-backend-0.5.3-rateio-etapa-2-backend.zip -d .

4. Confira a sintaxe e rode os testes locais:

node --check src/routes/fornecedores_bancos.js
node --check src/services/contasPagarRateioService.js
node --check scripts/migrate_rateio_contas_pagar_backend.js
node --check scripts/check_rateio_contas_pagar_backend.js
node --check scripts/rollback_rateio_contas_pagar_backend.js
npm run test:rateio-cp-backend

5. Ative a regra de backend no banco:

npm run db:migrate:rateio-cp-backend

6. Faça a conferência somente leitura:

npm run db:check:rateio-cp-backend

Resultado esperado antes da publicação do frontend:
- tabelas e coluna: OK;
- função de duplicidade: OK;
- trigger: OK;
- grupos inconsistentes: 0;
- lançamentos de rateio sem item: 0;
- vínculos inconsistentes: 0;
- documentos duplicados fora do mesmo grupo: 0.

7. Atualize o histórico de versões:

npm run db:migrate:system-releases

8. Inicie novamente o backend:

pm2 restart larmhub-api --update-env
pm2 status
pm2 logs larmhub-api --lines 100

TESTE DE REGRESSÃO RECOMENDADO
Antes de avançar para a tela 0.5.4, cadastre pelo formulário atual um lançamento
comum de teste e confirme:
- cadastro normal;
- parcelas;
- detalhe;
- baixa e cancelamento da baixa;
- exclusão de um lançamento de teste sem baixa.

O frontend atual não envia "rateios", portanto nenhuma operação de rateio será
criada pela interface nesta etapa.

ROLLBACK DESTA ETAPA
Somente se nenhum rateio tiver sido criado:

pm2 stop larmhub-api
npm run db:rollback:rateio-cp-backend

Depois restaure os arquivos do backup e reinicie o processo. O rollback desta
etapa restaura apenas a regra anterior de duplicidade; a estrutura vazia criada
na etapa 0.5.2 permanece instalada.

NÃO execute o rollback se o sistema informar que já existem dados de rateio.
Nesse caso, mantenha o backend compatível e faça uma análise antes de qualquer
alteração.

OBSERVAÇÃO
A migration não foi executada por este pacote em produção. Ela será executada
somente pelos comandos acima no ambiente do cliente.
