LARMHUB — ATUALIZAÇÃO 0.3.80
================================

OBJETIVO
--------
1. Restaurar e deixar visível o botão "Inativar" no Movimento Orçado.
2. Adicionar baixa manual no Contas a Receber, com geração do Movimento Bancário.

MOVIMENTO ORÇADO
----------------
- A coluna Ações foi movida para imediatamente depois da coluna Data.
- O botão não fica mais escondido no final da tabela horizontal.
- O frontend reconhece perfil administrativo/financeiro e permissão de escrita como fallback.
- O backend reconhece os perfis:
  super_admin, admin, manager, controller, financial e equivalentes legados em português.
- A inativação continua sem apagar o registro.
- Motivo, usuário, data e hora permanecem registrados no histórico e na auditoria.
- O botão "Registros inativados" continua disponível no topo da tela.

CONTAS A RECEBER — BAIXA MANUAL
--------------------------------
- Parcelas abertas ou atrasadas exibem o botão "Baixa manual" para usuários autorizados.
- A tela solicita:
  * data do recebimento;
  * valor recebido;
  * conta bancária;
  * forma de pagamento;
  * observações opcionais.
- A confirmação executa uma única transação PostgreSQL:
  * cria uma entrada em fin_movimento;
  * vincula o movimento à com_parcelas.movimento_id;
  * marca a parcela como paga;
  * grava origem_baixa = manual;
  * registra dados de conciliação e auditoria.
- A operação bloqueia parcela já baixada, repetição, conta inativa e conta de outra empresa.

BANCO DE DADOS
--------------
Não há nova tabela para a baixa manual.

Para garantir os campos de inativação do Movimento Orçado, execute a migration idempotente:

  node scripts/migrate_movimento_orcado_inativacao.js

PUBLICAÇÃO RECOMENDADA
----------------------
Backend primeiro:

  cd /var/www/lotemobile-api
  npm ci
  node scripts/migrate_movimento_orcado_inativacao.js
  node scripts/migrate_system_releases.js
  pm2 restart larmhub-api

Frontend:

  npm ci
  npm run type-check
  npm run build

Depois publique no Vercel. Após a publicação, atualize a página com Ctrl+F5. Caso a sessão seja antiga, saia e entre novamente.

VALIDAÇÕES EXECUTADAS
---------------------
- node --check no backend: aprovado.
- npm run type-check: aprovado sem erros.
- next build: compilação e validação de tipos aprovadas; permanecem somente avisos preexistentes de lint em outras telas.
