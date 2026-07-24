LarmHub Frontend 0.6.8 — confirmação objetiva de juros e desconto

ALTERAÇÕES
- Envia ao backend os dados da parcela selecionada, e não somente uma chave temporária da análise.
- A vinculação usa nosso número, cliente, nome/fração da parcela, obra e unidade como dados de conferência.
- Mostra em cada parcela elegível: “Ao aplicar: juros R$ ... · desconto R$ ...”.
- Antes da confirmação, mostra o total de juros e o total de descontos selecionados.
- Mantém a validação visual pelo operador antes da aplicação.

INSTALAÇÃO
1. Faça backup dos dois arquivos listados em ARQUIVOS-ALTERADOS-0.6.8-FRONTEND.txt.
2. Extraia este ZIP na raiz do frontend atual.
3. Execute o build normal do projeto e publique na Vercel.

IMPORTANTE
- Publicar junto com o backend 0.6.8.
- Não há alteração visual fora da conferência inteligente de Contas a Receber.
- Não há alteração de banco de dados.

VALIDAÇÃO EXECUTADA
- Os dois arquivos TSX alterados foram transpilados com TypeScript sem erro de sintaxe.
