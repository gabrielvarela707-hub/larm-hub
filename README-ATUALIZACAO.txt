LARMHUB FRONTEND v0.3.41

Alterações em Contas a Pagar:
- Adicionado o botão "Editar fornecedor" ao lado de "+ Novo fornecedor".
- Ao editar o fornecedor dentro do lançamento, a lista é atualizada sem fechar o lançamento.
- Criado o campo Forma de pagamento / modalidade com as opções PIX, Boleto, TED e DOC.
- PIX preenche automaticamente a chave cadastrada no fornecedor e permite ajuste no lançamento.
- TED/DOC preenchem automaticamente banco, código, agência, conta, dígito e tipo de conta do fornecedor.
- Boleto permite digitar a linha digitável e anexar múltiplos arquivos PDF ou imagem.
- Boletos já salvos podem ser abertos ou removidos durante a edição.
- Limite visual: 6MB por boleto e 20MB no total dos novos boletos.

Versionamento:
- Versão atual: 0.3.41.
- Regra registrada: após 0.3.99, a próxima versão será 0.4.0.

Instalação:
1. Extraia o ZIP na raiz do frontend.
2. Confirme a substituição dos arquivos.
3. Publique novamente na Vercel.

Arquivos alterados:
- src/app/(dashboard)/financeiro/pagar/page.tsx
- src/data/system_releases_seed.js
- package.json
- package-lock.json
- README-ATUALIZACAO.txt
