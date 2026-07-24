const fs = require('fs')
const path = require('path')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const component = fs.readFileSync(path.join(__dirname, '../src/components/financeiro/StratoIntelligentReview.tsx'), 'utf8')
const page = fs.readFileSync(path.join(__dirname, '../src/app/(dashboard)/financeiro/receber/page.tsx'), 'utf8')

assert(component.includes('parcelSelectionKey'), 'Chave de seleção por parcela ausente.')
assert(component.includes('Aplicar ${selectedSelections.length} ajuste(s) e baixa(s)'), 'Botão de aplicação não foi habilitado.')
assert(component.includes('CRIAR_PARCELA_E_BAIXAR'), 'Parcela ausente em contrato existente não está elegível.')
assert(component.includes('CLIENTE_AUSENTE'), 'Bloqueio de cliente ausente não foi preservado.')
assert(component.includes('Loader2'), 'Estado de aplicação em andamento não foi implementado.')
assert(component.includes('window.confirm'), 'A aplicação financeira precisa de confirmação explícita no frontend.')
assert(page.includes('aplicar_analise_inteligente: true'), 'Frontend não envia a confirmação inteligente.')
assert(page.includes('selecoes_inteligentes'), 'Frontend não envia a seleção das parcelas.')
assert(page.includes('itemIndex + 1'), 'Numeração visual dos itens deve iniciar em 1.')
assert(page.includes('<th style="width: 4%">Item</th>'), 'O PDF do retorno também deve usar Item em vez da linha física CNAB.')
assert(page.includes('pendingStratoApplyPayload'), 'Arquivos da conferência não foram preservados para a aplicação.')

console.log('Frontend Strato 0.6.5: seleção por parcela, aplicação, bloqueios e numeração iniciando em 1 conferidos.')
