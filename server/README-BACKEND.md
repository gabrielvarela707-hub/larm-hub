# LarmHub Backend 0.8.2

Correção final do fluxo Strato multiparcelas.

## O que corrige

- Vencimento de campos PostgreSQL `DATE` não é mais deslocado para o dia anterior pelo fuso horário.
- Parcelas futuras com a mesma fração deixam de causar ambiguidade.
- Divergências de valor nominal, fração ou vencimento não reabrem uma baixa já corrigida.
- Somente juros/moras, desconto, seguro, resíduo e valor pago geram correção financeira.
- `liquidado_corrigido` passa a encerrar corretamente o item do retorno.

## Instalação

```bash
unzip -o LarmHub-Backend-0.8.2-Fechamento-Strato.zip
cd LarmHub-Backend-0.8.2-Fechamento-Strato

LARMHUB_BACKEND_DIR=/var/www/lotemobile-api \
APP_NAME=lotemobile-api \
bash instalar-backend-0.8.2.sh
```

Sem migration, sem `npm install` e sem atualização do frontend 0.8.1.
