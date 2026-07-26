LarmHub Backend 0.6.8 — aplicação simples de juros e desconto do retorno Strato

OBJETIVO
Vincular a parcela conferida pelo operador e aplicar somente os valores financeiros do retorno: juros/moras, desconto, seguro e resíduo, sem substituir dados cadastrais ou contratuais da parcela.

ALTERAÇÕES
- Remove o cancelamento geral causado por chave de seleção antiga após a reanálise.
- Localiza a parcela primeiro pelo ID e, como contingência, por arquivo normalizado + nosso número + cliente + parcela/fração.
- Aceita nomes equivalentes do arquivo, por exemplo CB070700.RET, CB070700 (1).RET e CB070700 (1)(1).RET.
- Atualiza somente os valores financeiros da parcela existente; não troca documento legado, vencimento, valor nominal, cliente, contrato, obra ou unidade.
- Mantém a baixa, o Movimento Bancário e a auditoria já existentes.
- Uma seleção que não puder ser ligada gera aviso, mas não cancela as outras parcelas válidas.
- A resposta informa separadamente quanto foi ajustado de juros e de desconto.
- Não cria tabela e não exige migration de estrutura do banco.

ARQUIVOS PRINCIPAIS
- src/services/stratoIntelligentApplyService.js
- src/routes/recebiveis.js

INSTALAÇÃO
1. Faça backup dos arquivos relacionados em ARQUIVOS-ALTERADOS-0.6.8-BACKEND.txt.
2. Extraia este ZIP na raiz do backend atual, preservando o arquivo .env.
3. Execute os testes:
   node --check src/services/stratoIntelligentApplyService.js
   node --check src/routes/recebiveis.js
   npm run test:strato-apply
   npm run test:strato-matching
   npm run test:strato-inteligente
4. Opcional, apenas para registrar a versão no histórico do sistema:
   node scripts/migrate_system_releases.js
5. Reinicie o processo do backend conforme o ambiente. Exemplo:
   pm2 restart larmhub-api --update-env

IMPORTANTE
- Aplicar sobre a base 0.6.7 enviada junto ao frontend atual. O arquivo backend(3).zip recebido está na versão 0.5.3 e não contém o fluxo inteligente atual.
- Publicar backend e frontend 0.6.8 juntos. O backend continua aceitando a chave antiga, mas o frontend novo envia os identificadores necessários para evitar nova recusa após a reanálise.
- Não executar migrations antigas nem seeds financeiros para este ajuste.

TESTES EXECUTADOS
- Mudança da linha física do retorno sem perder a parcela: aprovado.
- Mudança de sufixo do nome do arquivo: aprovado.
- Localização por nosso número + cliente + parcela/fração: aprovado.
- Cliente incorreto não vincula: aprovado.
- Proteção contra alteração de documento legado da parcela existente: aprovado.
