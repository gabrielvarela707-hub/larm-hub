A consulta auditar_cb230700_lucky.sql é somente leitura.

Exemplo com autenticação do Windows:
sqlcmd -S localhost -E -d BKPTMP -i auditar_cb230700_lucky.sql -W -s ";" -o resultado-cb230700-lucky.txt

Exemplo com usuário SQL Server:
sqlcmd -S localhost -U usuario -P senha -d BKPTMP -i auditar_cb230700_lucky.sql -W -s ";" -o resultado-cb230700-lucky.txt

Envie o arquivo resultado-cb230700-lucky.txt antes da etapa de correção/baixa.
