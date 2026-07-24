LARMHUB FRONTEND 0.6.4 — APLICAÇÃO INTELIGENTE STRATO
=====================================================

OBJETIVO
Concluir o fluxo iniciado na 0.6.3, permitindo selecionar e aplicar pela tela
as parcelas elegíveis identificadas pelo RET e pelo relatório Strato.

ALTERAÇÕES
- Checkbox por parcela elegível e opção de selecionar todas.
- Botão Aplicar ajustes e baixas com confirmação explícita.
- Estado de carregamento durante a aplicação.
- Reenvio seguro dos mesmos arquivos ao backend para nova análise antes da
  escrita.
- Atualização da conferência após a aplicação.
- Cliente ou contrato ausente/ambíguo continua destacado e bloqueado.
- Parcela ausente em contrato existente pode ser selecionada para criação e
  baixa pelo backend.
- A tabela principal do retorno usa a coluna Item e começa em 1.
- O PDF do retorno também usa Item e começa em 1.
- A linha física do CNAB não foi alterada; continua disponível internamente
  para auditoria e relacionamento bancário.

BACKUP
Na raiz do frontend:
mkdir -p /root/larmhub-frontend-backup-0.6.4
cp package.json package-lock.json /root/larmhub-frontend-backup-0.6.4/
cp "src/app/(dashboard)/financeiro/receber/page.tsx" /root/larmhub-frontend-backup-0.6.4/
cp src/components/financeiro/StratoIntelligentReview.tsx /root/larmhub-frontend-backup-0.6.4/

INSTALAÇÃO
1. Extraia o ZIP na raiz do frontend:
   unzip -o larmhub-frontend-0.6.4-aplicacao-inteligente-strato.zip -d .

2. Execute:
   npm run test:strato-review
   npm run test:strato-apply-frontend
   npm run type-check
   npm run build

Resultados específicos esperados:
   Frontend Strato 0.6.4: relatório visual ... conferidos.
   Frontend Strato 0.6.4: seleção por parcela ... iniciando em 1 conferidos.

3. Publique/reinicie o frontend somente se type-check e build terminarem sem
   erro.

ORDEM DE PUBLICAÇÃO
Publique primeiro o backend 0.6.4 e confirme a API. Depois publique o frontend
0.6.4. O frontend 0.6.4 não deve ser publicado com backend anterior.

TESTE
- O primeiro título da tabela principal deve aparecer como Item 1.
- Um caso complexo deve abrir a Conferência inteligente Strato.
- As parcelas elegíveis devem aparecer marcadas.
- Ao clicar em Aplicar, deve aparecer uma confirmação.
- Após confirmar, a tela deve atualizar a situação das parcelas sem consolidar
  os movimentos.
