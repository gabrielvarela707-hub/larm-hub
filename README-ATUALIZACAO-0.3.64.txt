LARMHUB FRONTEND 0.3.64
========================

Arquivos atualizados:
- src/app/(dashboard)/financeiro/receber/page.tsx
- src/app/(dashboard)/cadastros/clientes/page.tsx
- src/data/system_releases_seed.js
- package.json
- package-lock.json

Ajustes:
1. Configuração Bradesco usa as empresas já cadastradas no sistema.
2. Selecionar LARM ou LUCKY preenche beneficiário, CNPJ e endereço sem alterar agência, conta, carteira ou código do convênio.
3. CEP automático na configuração Bradesco e no cadastro de clientes.
4. Cabeçalho da tabela de clientes congelado.
5. Botões separados para visualizar, alterar e inativar.
6. Novo cliente recebe automaticamente o último código numérico + 1.
7. Mantido o fluxo restaurado de geração de boleto da versão 0.3.62/0.3.63.

Aplicação:
1. Extrair na raiz do frontend.
2. Não é necessário npm install.
3. Executar npm run build e publicar.

O backend 0.3.64 deve ser publicado antes deste frontend.
