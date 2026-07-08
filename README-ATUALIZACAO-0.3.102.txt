LarmHub Web 0.3.102

Alterações:
- Adicionado botão Exportar PDF no painel de Resultado do retorno Bradesco.
- A planilha do resultado agora exibe a coluna Arquivo, evitando confusão quando LARM e LUCKY são processados juntos e ambas têm linha 2, linha 3 etc.
- O PDF/print inclui resumo, arquivo, empresa e todos os títulos do retorno com status, ocorrência, cliente/contrato, nosso número, controle, documento, vencimento, valor e detalhe.
- Não altera backend nem regra financeira.

Instalação:
unzip -o larmhub-web-retorno-exportar-pdf-0.3.102.zip -d /caminho/do/larmhub-web
npm run build

Depois publique na Vercel.
