# Atualização 0.3.73 — Frontend

## Correção

- As setas dos cabeçalhos Código, Cliente e Categoria agora aplicam a ordenação ao clicar.
- O mesmo comportamento foi corrigido em Fornecedores.
- O segundo clique alterna entre crescente e decrescente.
- A listagem visível recebe uma ordenação defensiva enquanto a API retorna os dados ordenados do banco.
- Nenhuma tela ou regra fora dos cadastros foi alterada.

## Aplicação

Extraia na raiz do frontend e publique novamente.

```bash
npm run type-check
npm run build
```
