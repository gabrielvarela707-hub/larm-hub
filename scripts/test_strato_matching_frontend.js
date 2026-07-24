#!/usr/bin/env node
const assert = require('assert')
const fs = require('fs')
const path = require('path')

const page = fs.readFileSync(path.join(__dirname, '../src/app/(dashboard)/financeiro/receber/page.tsx'), 'utf8')
const review = fs.readFileSync(path.join(__dirname, '../src/components/financeiro/StratoIntelligentReview.tsx'), 'utf8')

assert(page.includes('function fullNossoNumero'))
assert(page.includes('nosso_numero_dv?: string | null'))
assert(page.includes('candidatos_conciliacao?: ReturnReconciliationCandidate[]'))
assert(page.includes('Correspondência provável:'))
assert(page.includes('juros, moras ou desconto'))
assert(page.includes('{fullNossoNumero(item)}'))
assert(page.includes('escapePdfHtml(fullNossoNumero(item))'))

assert(review.includes('natureza_financeira?:'))
assert(review.includes('confirmacao_recomendada?: boolean'))
assert(review.includes('Correspondência provável — confirme os valores antes de aplicar.'))
assert(review.includes('Acréscimo por juros/moras'))
assert(review.includes('Desconto provável'))
assert(review.includes('Marque a parcela para confirmar a correspondência e os valores.'))
assert(review.includes("analysis.versao || '0.6.5'"))

console.log('Frontend Strato 0.6.5: boleto completo com DV, candidato provável, juros/desconto e confirmação assistida conferidos.')
