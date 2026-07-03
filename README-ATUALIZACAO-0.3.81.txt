LARMHUB 0.3.81 — RETORNO BRADESCO / BAIXAS DO CONTAS A RECEBER

Objetivo
- Corrigir a conciliação dos retornos Bradesco CNAB 400 com os títulos importados do Strato.
- Efetuar as baixas de 30/06/2026 e 01/07/2026 com criação do Movimento Bancário.
- Permitir prévia real sem gravar dados.
- Evitar duplicidade em arquivos já processados ou parcelas já baixadas.

Arquivos enviados pelo cliente incluídos no backend
- CB010700 Larm 30-06.RET
- CB010700 Lucky 30-06.RET
- CB020700 (Lucky 01-07).RET
- CB020700 Larm 01-07.RET

Resultado validado no banco fornecido
- 16 detalhes CNAB analisados.
- 14 ocorrências de liquidação (06).
- 12 detalhes conciliados com segurança.
- 11 liquidações prontas para baixa.
- Valor seguro para baixa: R$ 21.168,32.
- 4 detalhes, correspondentes a 3 títulos, ficaram sem vínculo seguro e NÃO são baixados automaticamente.

A prévia executada na produção é a fonte final de verdade. Se a base de produção estiver mais atualizada, a quantidade pode ser diferente.

Publicação do backend
1. Copiar os arquivos do pacote sobre /var/www/lotemobile-api.
2. Executar:

   cd /var/www/lotemobile-api
   npm ci
   node scripts/migrate_retorno_bradesco_strato.js

3. Executar somente a prévia:

   node scripts/seed_processar_retornos_bradesco_ate_2026_07_01.js

4. Conferir a linha "Liquidações prontas para baixar".
5. Executar com a quantidade exata apresentada. Exemplo, se forem 11:

   node scripts/seed_processar_retornos_bradesco_ate_2026_07_01.js --execute --confirmar=11

6. Registrar versão e reiniciar:

   node scripts/migrate_system_releases.js
   pm2 restart larmhub-api
   pm2 status

Publicação do frontend
- Publicar o frontend 0.3.81 no Vercel.
- Após publicar, atualizar a tela com Ctrl+F5.

Comportamento implementado
- A ocorrência 06 marca a parcela como paga, registra valor/data da baixa e cria entrada em fin_movimento.
- O Movimento Bancário fica vinculado à parcela por movimento_id.
- A data contábil utiliza a data da ocorrência; a data de crédito permanece registrada nos metadados.
- A empresa LARM ou LUCKY é identificada pelo cabeçalho do retorno.
- A conta Bradesco ativa da mesma empresa é selecionada automaticamente.
- Títulos do Strato são conciliados pelo controle do participante e pelo relacionamento ts1_core -> contrato STR.
- Fallback por empresa, vencimento, tipo e valor só é usado quando existe um único candidato seguro.
- Arquivos, parcelas ou movimentos já processados não são duplicados.
- A opção sem "Baixar liquidações" no painel é apenas prévia e não bloqueia o processamento definitivo.

Itens não conciliados no banco fornecido
- LUCKY: documento 01/09-ENTR, valor R$ 3.133,27.
- LUCKY: documento 01/01-ENT, valor R$ 56.842,63.
- LARM: documento 50/120-PA, valor R$ 1.597,18 (ocorrências 02 e 06).

Esses itens não possuem controle do participante e os respectivos títulos não foram encontrados na base enviada. Eles permanecem intactos para conferência manual; não devem ser criados ou baixados por aproximação.
