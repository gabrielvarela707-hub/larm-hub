LarmHub Backend 0.6.7 — hotfix da aplicação por identidade da parcela

ALTERAÇÕES
- Corrige a recusa de seleções v2 quando a linha física do CNAB muda entre a prévia e a reanálise.
- Para parcelas existentes, o ID UUID passa a ser a identidade principal dentro do mesmo arquivo.
- A linha do retorno continua gravada para auditoria, mas não impede a aplicação quando o ID é único.
- Não altera banco de dados e não exige frontend novo.

INSTALAÇÃO
1. Faça backup de package.json, package-lock.json, src/services/stratoIntelligentApplyService.js e src/data/system_releases_seed.js.
2. Extraia o ZIP na raiz do backend.
3. Execute:
   node --check src/services/stratoIntelligentApplyService.js
   npm run test:strato-apply
   npm run test:strato-matching
   npm run test:strato-inteligente
   node scripts/migrate_system_releases.js
4. Reinicie:
   pm2 restart larmhub-api --update-env

RESULTADO ESPERADO DO TESTE PRINCIPAL
Aplicação inteligente Strato 0.6.7: identidade da parcela preservada mesmo com mudança de linha, transação e bloqueio de falso sucesso conferidos.
