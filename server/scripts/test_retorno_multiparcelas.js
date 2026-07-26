/**
 * Teste estático da Etapa 0.6.1. Não acessa banco e não grava dados.
 */

const fs = require('fs')
const path = require('path')
const assert = require('assert')

const root = path.resolve(__dirname, '..')
const migration = fs.readFileSync(path.join(__dirname, 'migrate_retorno_multiparcelas.js'), 'utf8')
const check = fs.readFileSync(path.join(__dirname, 'check_retorno_multiparcelas.js'), 'utf8')
const rollback = fs.readFileSync(path.join(__dirname, 'rollback_retorno_multiparcelas.js'), 'utf8')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

assert(/^0\.(?:6\.[1-9]|[7-9]\.\d+)$/.test(pkg.version), `Versão atual incompatível: ${pkg.version}`)
assert(pkg.scripts['db:migrate:retorno-multiparcelas'])
assert(pkg.scripts['db:check:retorno-multiparcelas'])
assert(pkg.scripts['db:rollback:retorno-multiparcelas'])

assert(migration.includes('CREATE TABLE IF NOT EXISTS fin_retornos_cobranca_item_parcelas'))
assert(migration.includes('REFERENCES fin_retornos_cobranca_itens(id) ON DELETE CASCADE'))
assert(migration.includes('REFERENCES com_parcelas(id) ON DELETE SET NULL'))
assert(migration.includes('REFERENCES fin_movimento(id) ON DELETE SET NULL'))
assert(migration.includes('valor_nominal'))
assert(migration.includes('valor_juros_financeiro'))
assert(migration.includes('valor_seguro'))
assert(migration.includes('valor_moras'))
assert(migration.includes('valor_desconto'))
assert(migration.includes('valor_residuo'))
assert(migration.includes('valor_pago'))
assert(migration.includes('bloqueado BOOLEAN NOT NULL DEFAULT TRUE'))
assert(migration.includes('UNIQUE (retorno_item_id, ordem)'))
assert(migration.includes('WHERE parcela_id IS NOT NULL'))
assert(!migration.match(/UPDATE\s+com_parcelas/i))
assert(!migration.match(/INSERT\s+INTO\s+fin_movimento/i))
assert(!migration.match(/DELETE\s+FROM/i))

assert(check.includes('BEGIN READ ONLY'))
assert(check.includes("await client.query('ROLLBACK')"))
assert(rollback.includes('Rollback bloqueado'))
assert(rollback.includes('COUNT(*)::int AS total'))

// Exemplo contábil da Briza: 9 x 1.847,48 + 1 x 1.847,47.
const brizaPagoCentavos = (9 * 184748) + 184747
const brizaDescontoCentavos = (9 * 22573) + 22574
const brizaNominalCentavos = 10 * 207321
assert.strictEqual(brizaPagoCentavos, 1847479)
assert.strictEqual(brizaDescontoCentavos, 225731)
assert.strictEqual(brizaNominalCentavos - brizaDescontoCentavos, brizaPagoCentavos)

console.log('Retorno multiparcelas 0.6.1: estrutura, descontos, vínculos e proteções estáticas OK.')
