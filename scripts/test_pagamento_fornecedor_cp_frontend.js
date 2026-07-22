const assert = require('assert')
const fs = require('fs')
const path = require('path')
const ts = require('typescript')

const pagePath = path.join(
  __dirname,
  '..',
  'src',
  'app',
  '(dashboard)',
  'financeiro',
  'pagar',
  'page.tsx',
)
const source = fs.readFileSync(pagePath, 'utf8')

assert(!source.includes('Banco para Pagamento'), 'O campo antigo Banco para Pagamento ainda está na tela.')
assert(!source.includes('Conta cadastrada (opcional)'), 'O campo antigo Conta cadastrada ainda está na tela.')
assert(source.includes("modalidade === 'TED' || modalidade === 'DOC' || modalidade === 'TRANSFERENCIA'"))
assert(source.includes("fModalidadePagamento === 'TED' || fModalidadePagamento === 'DOC' || fModalidadePagamento === 'TRANSFERENCIA'"))
assert(source.includes('<BancoSearchSelect'))
assert(source.includes('atualizarFornecedorLocalPagamento()'))
assert(source.includes('também atualiza o cadastro do fornecedor'))
assert(source.includes('linha_digitavel_boleto: fLinhaDigitavelBoleto || null'))

const result = ts.transpileModule(source, {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
  reportDiagnostics: true,
  fileName: pagePath,
})
const diagnostics = result.diagnostics || []
assert.strictEqual(
  diagnostics.length,
  0,
  diagnostics.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n'),
)

console.log('Pagamento CP frontend: campos antigos removidos e modalidades conferidas.')
