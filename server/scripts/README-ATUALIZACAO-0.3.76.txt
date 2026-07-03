LARMHUB BACKEND 0.3.76

ALTERAÇÕES
1. Inativação segura do Movimento Orçado
- Novo endpoint PATCH /financeiro/orcamento/movimento/:id/inativar.
- A operação é soft delete: o registro continua no banco e recebe ativo=false.
- Motivo obrigatório entre 5 e 500 caracteres.
- São registrados usuário, data/hora e motivo da inativação.
- A listagem GET /financeiro/orcamento/movimento aceita status=ativos, status=inativos ou status=todos.
- Por padrão, a tela e a API retornam somente registros ativos.

2. Auditoria
- Cada operação grava o evento movimento_orcado_inativado em hub_audit_logs.
- O log contém o lançamento anterior, motivo, responsável, e-mail e data/hora.
- O histórico de inativados também retorna os dados do responsável diretamente para a tela.

3. Permissão
- Podem inativar: super_admin, admin, manager, controller e financial.
- Os demais perfis continuam com consulta conforme as permissões já existentes, sem autorização para inativar.

4. Banco de dados
- Novos campos em fin_orcamento_movimento:
  ativo BOOLEAN NOT NULL DEFAULT TRUE
  inativado_em TIMESTAMP
  inativado_por UUID
  motivo_inativacao TEXT
- Novos índices por ativo e por ano/ativo.

VERSÃO
- Backend: 0.3.76
- Frontend esperado: 0.3.76

INSTALAÇÃO
1. Extrair os arquivos na raiz do backend.
2. Executar:
   npm ci
   node scripts/migrate_movimento_orcado_inativacao.js
   node scripts/migrate_system_releases.js
   pm2 restart larmhub-api

COMANDOS ALTERNATIVOS
- Migration da inativação:
  npm run db:migrate:movimento-orcado-inativacao
- O changelog continua usando como fonte canônica:
  src/data/system_releases_seed.js
- A cópia scripts/system_releases_seed.js também foi sincronizada para compatibilidade.

SEGURANÇA
- A migration não inativa nem exclui nenhum registro existente.
- O lançamento destacado deve ser inativado pela tela após a publicação, garantindo usuário e motivo corretos no log.
