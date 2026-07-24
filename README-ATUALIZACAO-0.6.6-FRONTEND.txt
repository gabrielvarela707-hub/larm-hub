LARMHUB FRONTEND 0.6.6 — SELEÇÃO ESTÁVEL DA PARCELA STRATO

OBJETIVO
Garantir que a parcela marcada na conferência continue sendo a mesma parcela quando o backend recalcular a análise antes da gravação.

CORREÇÃO
- remove a chave temporária baseada na posição visual 0:0:0;
- usa uma chave estável por arquivo, linha física do retorno e ID da parcela;
- quando a parcela ainda não existe, usa obra, unidade, fração e boleto;
- mantém a confirmação explícita e o restante da tela sem alterações.

INSTALAÇÃO
1. Faça backup dos arquivos atuais.
2. Extraia este ZIP na raiz do frontend.
3. Execute:

npm run test:strato-apply-frontend
npm run test:strato-matching-frontend
npm run test:strato-review
npm run type-check
npm run build

Publique somente depois do backend 0.6.6.
