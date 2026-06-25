LARMHUB FRONTEND 0.3.66
========================

Arquivos atualizados:
- src/app/(dashboard)/financeiro/receber/page.tsx
- src/data/system_releases_seed.js
- package.json
- package-lock.json

Ajustes:
1. Botão Enviar por e-mail diretamente na tela final do boleto.
2. Botão Compartilhar no WhatsApp diretamente na tela final do boleto.
3. O retorno de sucesso ou erro aparece na própria aba do boleto.
4. O envio utiliza as rotas já existentes do backend 0.3.65, sem alterar a geração bancária.
5. Ao imprimir/salvar em PDF, o nome sugerido usa até 10 caracteres do nome do cliente e a data de emissão do documento.
6. Exemplo: VANDERCLEB_2026-06-25.pdf.
7. Nenhuma alteração em recálculo, nosso número, linha digitável, código de barras, remessa ou CNAB.

Aplicação:
1. Extrair na raiz do frontend.
2. Não é necessário npm install.
3. Executar npm run build e publicar no Vercel.
4. Manter o backend 0.3.65 já instalado.
