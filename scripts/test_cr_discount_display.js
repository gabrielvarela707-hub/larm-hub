#!/usr/bin/env node
'use strict'

const fs = require('fs')
const assert = require('assert/strict')
const path = require('path')

const pagePath = path.join(__dirname, '..', 'src', 'app', '(dashboard)', 'financeiro', 'receber', 'page.tsx')
const source = fs.readFileSync(pagePath, 'utf8')

assert.match(source, /Valor líquido após descontos e juros/)
assert.match(source, /Nominal \{formatCurrency\(row\.valor_nominal\)\}/)
assert.match(source, /Desconto -\{formatCurrency\(row\.valor_desconto \|\| 0\)\}/)
assert.match(source, /Juros \+\{formatCurrency\(row\.valor_juros_mora \|\| 0\)\}/)
assert.match(source, /Recebido \{formatCurrency\(row\.valor_pago \|\| 0\)\}/)
assert.match(source, /Number\(row\.valor_desconto \|\| 0\) > 0/)
assert.match(source, /Number\(row\.valor_juros_mora \|\| 0\) > 0/)
assert.match(source, /row\.status === 'paga'/)
assert.match(source, /\{formatCurrency\(row\.valor_total\)\}/)

console.log('Contas a Receber 0.6.0: valor líquido, nominal, desconto, juros e recebido ficam visíveis sem alterar cálculos ou ações.')
