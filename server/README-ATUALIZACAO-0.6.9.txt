LarmHub Backend 0.6.9 — hotfix da parcela aprovada no Strato

CORREÇÃO
A reanálise do backend podia escolher outra parcela matematicamente equivalente à exibida no frontend. Exemplo: o relatório trazia 042/120, mas a parcela aprovada possuía legado 7/20. Como 42/120 = 7/20, a prévia localizava a parcela, porém uma nova análise podia escolher outro registro e rejeitar a chave aprovada.

A versão 0.6.9 faz o seguinte:
- o ID da parcela aprovado pelo operador prevalece sobre o candidato escolhido na reanálise;
- arquivo + linha do RET são usados como referência quando a seleção antiga contém somente a chave v2;
- a correspondência por linha somente ocorre quando existe uma única seleção pendente naquela linha;
- aplica os valores do relatório na parcela selecionada: juros/moras, desconto, seguro, resíduo e valor recebido;
- mantém a geração do Movimento Bancário e a baixa da Conta a Receber;
- não altera cliente, contrato, documento, vencimento, nominal, obra ou unidade;
- não exige alteração do frontend 0.6.8;
- não possui migration de banco.

INSTALAÇÃO
1. Faça backup do backend atual.
2. Extraia este ZIP na raiz do backend 0.6.8, substituindo os arquivos existentes.
3. Não execute migration nem seed financeiro.
4. Execute:
   node --check src/services/stratoIntelligentApplyService.js
   node --check src/routes/recebiveis.js
   npm run test:strato-apply
   npm run test:strato-matching
   npm run test:strato-inteligente
5. Reinicie o backend. Exemplo:
   pm2 restart larmhub-api --update-env

ARQUIVO FUNCIONAL PRINCIPAL
src/services/stratoIntelligentApplyService.js

TESTES
- chave v2 antiga com ID aprovado diferente do candidato recalculado: aprovado;
- nome duplicado do RET: aprovado;
- frações equivalentes: aprovado;
- juros/moras e desconto: aprovado;
- multiparcelas e bloqueios existentes: aprovados.
