LARM HUB — BACKEND 0.3.83 (INCREMENTAL)
=========================================

Este pacote contém somente os arquivos alterados da versão 0.3.82 para a 0.3.83.
Não é cumulativo. Não há alteração de frontend nesta versão.

CORREÇÕES
---------
1. Retorno Bradesco
   - Corrigida a lacuna de parâmetros SQL que causava:
       could not determine data type of parameter $5
   - Corrigida também uma segunda lacuna que impediria a gravação dos itens
     quando a rotina fosse executada com --execute.
   - A prévia continua sem alterar o banco.
   - Se o Movimento Bancário consolidado da liquidação já existir para a mesma
     empresa e data, ele é reutilizado nas parcelas. Assim, a baixa não duplica
     a entrada financeira.
   - Quando não existe movimento consolidado, a rotina cria o Movimento
     Bancário normalmente.

2. Movimento Bancário de 29 e 30/06/2026
   - Reincluído e revisado o seed idempotente dos 20 movimentos faltantes.
   - 29/06: 13 movimentos.
   - 30/06: 7 movimentos.
   - Entradas: R$ 129.498,99.
   - Saídas: R$ 143.258,64.
   - A execução valida separadamente os dias 29 e 30 antes do COMMIT.

ORDEM CORRETA DE EXECUÇÃO
-------------------------
Execute primeiro a carga de 29 e 30/06. Depois processe os retornos Bradesco.
Essa ordem permite reutilizar as liquidações consolidadas de 30/06 sem duplicar
entradas no Movimento Bancário.

1. Copie o conteúdo deste ZIP sobre:

   /var/www/lotemobile-api

2. Não é necessário executar npm ci, pois nenhuma dependência mudou.

3. Prévia dos movimentos de 29 e 30/06:

   cd /var/www/lotemobile-api
   node scripts/seed_movimento_bancario_2026_06_29_30.js

   Na situação mostrada pelo cliente, o esperado é:

   Faltantes para inserir: 20
   Entradas faltantes: R$ 129.498,99
   Saídas faltantes: R$ 143.258,64

4. Execute usando a quantidade apresentada pela prévia. Se forem 20:

   node scripts/seed_movimento_bancario_2026_06_29_30.js --execute --confirmar=20

   Ao final, deve informar:

   Dia 29/06: 13
   Dia 30/06: 7

5. Prévia dos retornos Bradesco:

   node scripts/seed_processar_retornos_bradesco_ate_2026_07_01.js

   A prévia não altera o banco. Confira a quantidade de liquidações prontas e
   os itens não localizados.

6. Execute usando exatamente a quantidade apresentada. Exemplo, se forem 11:

   node scripts/seed_processar_retornos_bradesco_ate_2026_07_01.js --execute --confirmar=11

7. Registre a versão e reinicie a API:

   node scripts/migrate_system_releases.js
   pm2 restart larmhub-api
   pm2 status

IMPORTANTE
----------
- O erro anterior ocorreu ainda na prévia; portanto, aquela tentativa não fez
  baixas e não criou Movimentos Bancários.
- Não execute o seed dos movimentos com um número de confirmação diferente do
  mostrado na prévia.
- Não publique frontend: ele permanece na versão 0.3.82.
