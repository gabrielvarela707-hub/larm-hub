const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const componentPath = path.join(root, 'src/components/financeiro/StratoIntelligentReview.tsx')
const pagePath = path.join(root, 'src/app/(dashboard)/financeiro/receber/page.tsx')
const component = fs.readFileSync(componentPath, 'utf8')
const page = fs.readFileSync(pagePath, 'utf8')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

for (const label of ['Obra','Unid.','Parcela','Boleto','Vencimento','A pagar','J.FCT','Seguro','Moras','Desconto','Resíduo','Total','Recebimento','Pago','Diferença','LarmHub','Situação','Ação']) {
  assert(component.includes(`'${label}'`) || component.includes(`>${label}<`), `Coluna Strato ausente: ${label}`)
}

assert(component.includes('Aplicar ajustes e baixas — disponível na 0.6.4'), 'A etapa 0.6.3 deve manter a aplicação desabilitada.')
assert(component.includes('valor_desconto'), 'O desconto precisa permanecer separado.')
assert(component.includes('valor_juros_financeiro'), 'Juros financeiros precisam permanecer separados.')
assert(component.includes('valor_moras'), 'Moras precisam permanecer separadas.')
assert(component.includes('valor_residuo'), 'Resíduo precisa permanecer separado.')
assert(component.includes('ajuste_arredondamento'), 'A evidência de arredondamento precisa ser exibida.')
assert(component.includes('Exportar PDF'), 'A conferência precisa permitir exportação em PDF.')
assert(page.includes('responseData?.requires_review'), 'A tela precisa tratar a resposta HTTP 409 de revisão inteligente.')
assert(page.includes('setStratoIntelligentReview(reviewFiles)'), 'A análise retornada pelo backend precisa ser apresentada no frontend.')
assert(page.includes('<StratoIntelligentReview'), 'O componente de conferência precisa estar renderizado.')

console.log('Frontend Strato 0.6.3: relatório visual, multiparcelas, descontos, divergências, PDF e bloqueio de escrita conferidos.')
