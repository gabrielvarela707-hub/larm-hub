LARM-HUB — ATUALIZAÇÃO 0.4.1
Conferência de retorno Bradesco com relatório Strato e IA segura

OBJETIVO
Permitir enviar, junto com o arquivo CNAB .RET, o relatório Strato "Crítica Cobrança" em PDF ou imagem. A IA configurada no LarmHub lê e estrutura o relatório; a decisão de conciliar e baixar continua sendo feita pelo backend com regras determinísticas e margem mínima de segurança.

COMPORTAMENTO DE SEGURANÇA
- A IA não cria baixas por decisão própria.
- O sistema cruza boleto completo, código/nome do cliente, obra, unidade, vencimento e valor.
- Só aceita conciliação automática quando há candidato único, identidade confirmada e pelo menos duas evidências financeiras.
- Caso haja ambiguidade, o título continua como não localizado para conferência manual.
- Após uma conciliação segura, o nosso número, dígito e controle do retorno ficam vinculados à parcela, facilitando os próximos retornos.
- Dados existentes da parcela não são substituídos; apenas campos legados vazios podem ser complementados.

INSTALAÇÃO
1. Faça backup do código atual e do banco de dados.
2. Copie os arquivos deste pacote para a raiz do projeto, preservando os caminhos.
3. No backend, execute:

   cd server
   npm install
   node scripts/migrate_system_releases.js

4. No frontend, execute a instalação/build conforme o processo já utilizado no servidor:

   npm install
   npm run build

5. Reinicie os serviços do frontend e do backend.

Não há nova migração de estrutura de banco nesta versão. O comando migrate_system_releases atualiza somente o histórico/versionador do sistema.

CONFIGURAÇÃO DA IA
Em Configurações > Credenciais, mantenha configurado um dos provedores já suportados pelo sistema:
- OpenAI; ou
- Gemini.

COMO USAR
1. Abra Contas a Receber > Retorno Bradesco.
2. Clique em "Relatório Strato" e selecione o PDF/imagem correspondente.
3. Clique em "Importar Retorno" e selecione o arquivo .RET.
4. Para apenas conferir sem gravar baixas, desmarque a opção de baixar liquidações antes do processamento.
5. O resultado informa quantos títulos foram conciliados pela conferência do relatório/IA e mantém os casos inseguros para análise manual.

LIMITES
- Até 20 arquivos .RET por operação.
- Até 4 relatórios Strato por operação.
- Cada relatório deve ter aproximadamente até 5 MB.
- Ao enviar vários arquivos, o relatório precisa identificar o nome do .RET correspondente. Quando houver somente um RET e um relatório, a associação é direta.

ROLLBACK
Restaure os arquivos anteriores a partir do backup e reinicie os serviços. Como esta versão não altera a estrutura do banco, não há rollback de migration de schema.
