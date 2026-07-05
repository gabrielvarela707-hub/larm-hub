LarmHub Frontend 0.3.97 — Retorno Bradesco com todos os títulos

Arquivos alterados:
- src/app/(dashboard)/financeiro/receber/page.tsx
- package.json
- package-lock.json

O que muda:
- O resultado do retorno Bradesco passa a deixar claro que a tabela lista todos os títulos do arquivo.
- Linhas localizadas, já baixadas, baixadas agora, não localizadas e ocorrências sem liquidação aparecem no mesmo quadro.
- Quando a linha não foi conciliada, o cliente aparece como Não localizado.
- A tela explica que o CNAB 400 de retorno não traz o nome do pagador quando não há parcela localizada.

Instalação:
unzip -o larmhub-web-retorno-todos-titulos-0.3.97.zip -d /caminho/do/larmhub-web
npm run build
Publicar na Vercel.
