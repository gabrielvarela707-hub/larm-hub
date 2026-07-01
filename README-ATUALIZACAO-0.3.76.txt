LARMHUB FRONTEND 0.3.76

ALTERAÇÕES
1. Movimento Orçado
- Novo botão Inativar na coluna Ações dos lançamentos ativos.
- A inativação abre uma confirmação e exige o preenchimento do motivo.
- O registro não é excluído definitivamente: ele deixa a listagem ativa e permanece disponível para auditoria.
- Novo botão Registros inativados no topo da tela.
- A consulta de inativados exibe motivo, responsável, e-mail e data/hora da operação.
- Os cards de totais passam a considerar somente o grupo visualizado: ativos ou inativados.

2. Permissão
- O botão é exibido somente quando o backend autoriza a operação para o usuário autenticado.
- Perfis autorizados no backend: Super Admin, Admin, Gerente, Controladoria e Financeiro.

VERSÃO
- Frontend: 0.3.76
- Backend esperado: 0.3.76

INSTALAÇÃO
1. Extrair os arquivos do frontend na raiz do projeto.
2. Executar:
   npm ci
   npm run type-check
   npm run build
3. Publicar no Vercel.

OBSERVAÇÃO
- Nenhum lançamento é inativado automaticamente durante a atualização.
- Após o deploy, localizar o lançamento Brasil Agro II destacado e usar o botão Inativar, informando o motivo.
