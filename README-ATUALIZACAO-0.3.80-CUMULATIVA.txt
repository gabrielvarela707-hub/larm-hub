LARMHUB — ATUALIZAÇÃO CUMULATIVA 0.3.80
=========================================

Este pacote reúne integralmente as versões 0.3.79 e 0.3.80.
A ordem aplicada na montagem foi 0.3.79 e depois 0.3.80, preservando os arquivos mais recentes.

INCLUI DA 0.3.79
- Vencimento como primeira coluna em Contas a Pagar (/financeiro/pagar).
- Vencimento como primeira coluna na tela legada (/financeiro/contas-pagar).
- Vencimento como primeira coluna de dados em Contas a Receber.
- Seed dos movimentos bancários de 29 e 30/06/2026.
- Seed de limpeza completa do Contas a Pagar.

INCLUI DA 0.3.80
- Botão Inativar visível no Movimento Orçado.
- Histórico e auditoria da inativação.
- Baixa manual em Contas a Receber com geração de Movimento Bancário.
- Migration idempotente dos campos de inativação.

ATENÇÃO
- Os seeds de dados da 0.3.79 não são executados automaticamente.
- Faça primeiro as prévias e só depois execute com os parâmetros de confirmação.
- Execute a migration de inativação antes de reiniciar o backend.
