LARMHUB WEB 0.3.92 — PAGINAÇÃO DE FORNECEDORES

ALTERAÇÃO
- A tela Cadastros > Fornecedores passa a utilizar a mesma paginação da tela de Clientes.
- São exibidos 50 fornecedores por página.
- Incluídos indicador "Página X de Y" e botões anterior/próxima.
- Busca, empresa, categoria e ordenação retornam automaticamente para a primeira página.
- Mantidos cadastro, edição, inativação, histórico, importação, exportação e contratos.
- O backend já possuía suporte aos parâmetros page e limit; nenhuma rota foi alterada.

ARQUIVOS ALTERADOS
- src/app/(dashboard)/financeiro/fornecedores/page.tsx
- package.json
- package-lock.json

PUBLICAÇÃO
1. Extraia este ZIP na raiz do projeto larmhub-web.
2. Execute: npm run build
3. Publique normalmente na Vercel.

VERSÕES
- Frontend: 0.3.92
- Backend compatível: 0.3.91
