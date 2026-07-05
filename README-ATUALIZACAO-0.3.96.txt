LarmHub Web 0.3.96 — Resultado de retorno Bradesco mais explicativo

Arquivo alterado:
- src/app/(dashboard)/financeiro/receber/page.tsx

O que muda:
- A tela passa a tratar corretamente respostas da API no formato agrupado: data.arquivos + data.resumo.
- A mensagem do retorno diferencia baixa criada, título já baixado, título não localizado e ocorrência Bradesco sem liquidação.
- Quando nenhuma nova baixa é criada, a tela explica se isso ocorreu porque os títulos já estavam baixados ou porque não foram localizados.
- A tabela de resultado mostra todas as linhas do retorno com status, ocorrência, cliente/contrato localizado, nosso número, controle, documento, vencimento, valor e motivo.
- Ocorrências diferentes de 06 deixam de parecer erro de baixa e passam a ser exibidas como ocorrência sem liquidação.

Não altera:
- regras financeiras;
- banco de dados;
- backend;
- processamento real do retorno.

Instalação:
  unzip -o larmhub-web-retorno-explicativo-0.3.96.zip -d /caminho/do/larmhub-web
  npm run build
  publicar na Vercel
