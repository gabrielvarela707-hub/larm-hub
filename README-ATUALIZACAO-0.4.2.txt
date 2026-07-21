LARM-HUB — ATUALIZAÇÃO CUMULATIVA 0.4.2
Retorno Bradesco + relatório Strato/IA + Movimento Bancário e Cashflow realizado

OBJETIVO
- Manter os recursos da versão 0.4.1 para conferência do retorno Bradesco com relatório Strato e IA segura.
- Garantir que baixas do Contas a Receber apareçam no Movimento Bancário e, por consequência, no Cashflow realizado.
- Impedir que a tela antiga de Recebíveis quite uma parcela sem criar o Movimento Bancário correspondente.

O QUE FOI CORRIGIDO NA 0.4.2
1. O filtro do realizado passou a reconhecer fin_movimento vinculado a com_parcelas.movimento_id.
2. Baixas manuais e liquidações de retorno posteriores a 30/06/2026 deixam de ficar ocultas no Movimento Bancário/Cashflow.
3. A tela antiga de Recebíveis agora solicita a conta bancária e usa o mesmo fluxo transacional da tela Financeiro > Contas a Receber.
4. A rota antiga /parcelas/:id/baixar foi mantida por compatibilidade, mas agora reutiliza o fluxo seguro e exige banco_conta_id.
5. O Cashflow continua sem receber lançamentos diretos: a fonte do realizado permanece sendo fin_movimento.

SEGURANÇA FINANCEIRA
- Primeiro é criada a entrada em fin_movimento.
- Depois a parcela é marcada como paga e recebe movimento_id.
- Todo o processo ocorre dentro da mesma transação.
- Se qualquer etapa falhar, nem a baixa nem o movimento são gravados parcialmente.
- Não há criação duplicada de movimento para parcelas já baixadas.

BANCO DE DADOS
Não existe migration de estrutura nesta versão.
Execute somente o versionador/changelog:

  cd server
  npm install
  npm run db:migrate:system-releases

O comando acima atualiza hub_system_releases para 0.4.2.

INSTALAÇÃO COMPLETA
1. Faça backup do código e do banco.
2. Copie o conteúdo deste pacote para a raiz do projeto, preservando os caminhos.
3. Execute:

  cd server
  npm install
  npm run db:migrate:system-releases

  cd ..
  npm install
  npm run build

  pm2 restart larmhub-api --update-env
  pm2 save

Reinicie também o processo do frontend conforme o nome exibido em:

  pm2 list

Depois:

  pm2 restart NOME_DO_FRONTEND --update-env
  pm2 save

CONFERÊNCIA APÓS O DEPLOY
1. Faça uma baixa manual de teste selecionando a conta bancária.
2. Confirme que a parcela ficou paga e possui movimento_id.
3. Confirme que o lançamento aparece no Movimento Bancário na data do recebimento.
4. Confirme que o mesmo valor aparece no Cashflow em Realizado.
5. Processe um retorno em modo de prévia antes de executar a baixa definitiva.

AUDITORIA DE PARCELAS ANTIGAS
Esta atualização não inventa movimentos bancários para parcelas históricas que já estejam pagas sem movimento_id, pois seria necessário identificar com segurança a conta bancária correta.

Consulta somente leitura para localizar esses casos:

  SELECT
    p.id,
    c.numero AS contrato,
    p.numero AS parcela,
    p.pago_em,
    p.valor_pago,
    p.origem_baixa
  FROM com_parcelas p
  JOIN com_contratos c ON c.id = p.contrato_id
  WHERE LOWER(COALESCE(p.status, '')) = 'paga'
    AND p.movimento_id IS NULL
  ORDER BY p.pago_em, c.numero, p.numero;

Se essa consulta retornar registros, eles precisam de conciliação segura antes de criar ou vincular movimentos para não duplicar receitas.

ROLLBACK
Restaure os arquivos anteriores e reinicie frontend/backend. Não há rollback de schema porque nenhuma estrutura do banco foi alterada.
