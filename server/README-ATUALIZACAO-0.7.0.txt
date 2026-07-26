LarmHub Backend 0.7.0 — aplicação direta da parcela selecionada no Strato

OBJETIVO
Eliminar a trava de reencontro da parcela na aplicação final.

COMO FUNCIONA AGORA
1. O frontend envia a chave v2 já existente, contendo arquivo, linha do RET e ID da parcela.
2. O backend usa diretamente o ID aprovado pelo operador.
3. A linha do RET fornece juros/moras, desconto, seguro, resíduo, valor recebido e datas.
4. Não há nova exigência de conferir nome, nosso número, cliente ou fração para executar a baixa.
5. Se a reanálise não devolver candidatos, mas a linha for única, os valores da própria linha continuam sendo aplicados.

O QUE NÃO É ALTERADO
- valor nominal da parcela;
- vencimento;
- documento;
- cliente e contrato;
- obra e unidade;
- parcelas não selecionadas.

O QUE É ALTERADO
- juros financeiros e moras;
- desconto;
- seguro e resíduo;
- valor recebido e status da baixa;
- vínculo com o Movimento Bancário.

SEGURANÇA MANTIDA
O FOR UPDATE permanece somente para impedir duas baixas simultâneas na mesma parcela. Ele não participa da validação do vínculo e não impede a escolha feita pelo operador.

INSTALAÇÃO
Extraia este overlay na raiz do backend que já está na versão 0.6.9, preservando a estrutura de pastas.

Não execute npm install.
Não existe migration de banco.
Não é necessário atualizar o frontend.

Após substituir os arquivos:
pm2 restart larmhub-api --update-env

TESTE
node scripts/test_strato_intelligent_apply.js

RESULTADO ESPERADO
Aplicação inteligente Strato 0.7.0: seleção direta por ID + linha do RET e ajuste de juros/desconto conferidos.
