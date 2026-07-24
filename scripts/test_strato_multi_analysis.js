/**
 * Testes isolados da análise inteligente Strato 0.6.5.
 * Não conecta no PostgreSQL e não altera dados.
 */

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const {
  analyzeStratoMultiParcelReturn,
  groupReportRows,
  reconcileGroupRounding,
  fractionsEquivalent,
} = require('../src/services/stratoMultiParcelAnalysisService')
const { parseStratoPdfText, normalizeStratoReport } = require('../src/services/stratoReturnReportAnalyzer')

const sampleText = `
LUCKY CAPITAL EMPREENDIMENTOS LTDA Pag 001
CRÍTICA COBRANÇA Banco: 237-BANCO BRADESCO S/A Conta: 33214-3 C:\\STRATO\\RETORNO\\LUCKY\\CB230700.RET
  OBRA        UNID.       PARCELA       BOLETO                VENCTO       A PAGAR     J.FCT     SEGURO    MORAS         VL.DESC     RESIDUO      TOTAL
Conta                                                          PAGTO         PAGO                                                     TOTAL       VL.DIF
    7698          F-1     018/037            260000392183    15/06/2027     2.073,21      0,00      0,00       0,00          0,00          0,00    2.073,21
   33214                            1480-BRIZA LUCCI MAUSE   22/07/2026     2.073,21      0,00      0,00                   225,73      1.847,48      225,73
- 06-Motivo não cadastrado 0
    7698          F-1     019/037            260000392183    15/07/2027     2.073,21      0,00      0,00       0,00          0,00          0,00    2.073,21
   33214                            1480-BRIZA LUCCI MAUSE   22/07/2026     2.073,21      0,00      0,00                   225,73      1.847,48      225,73
TOTAL A PAGAR:
`

function makeRows() {
  return Array.from({ length: 10 }, (_, index) => ({
    indice_relatorio: index + 1,
    obra: '7698',
    unidade: 'F-1',
    parcela: `${String(index + 18).padStart(3, '0')}/037`,
    parcela_numero: index + 18,
    parcela_total: 37,
    boleto: '260000392183',
    vencimento: index < 7
      ? `2027-${String(index + 6).padStart(2, '0')}-15`
      : `2028-${String(index - 6).padStart(2, '0')}-15`,
    valor_titulo: 2073.21,
    valor_a_pagar: 2073.21,
    valor_total_original: 2073.21,
    cliente_codigo: '1480',
    cliente_nome: 'BRIZA LUCCI MAUSE',
    data_pagamento: '2026-07-22',
    valor_pago_base: 2073.21,
    valor_desconto: 225.73,
    valor_pago_total: 1847.48,
    valor_pago: 1847.48,
    valor_diferenca: 225.73,
    moras_pago: 0,
    juros_financeiro_pago: 0,
    seguro_pago: 0,
  }))
}

function fakeClient() {
  return {
    async query(sql, params) {
      if (sql.includes('FROM cad_clientes')) {
        return { rows: [{ id: 10, codigo: '1480', codigo_legado: '1480', nome: 'BRIZA LUCCI MAUSE' }] }
      }
      if (sql.includes('FROM com_contratos c') && !sql.includes('JOIN com_parcelas')) {
        return { rows: [{ id: '45c5d783-159d-49fd-8508-d4eee69c10b2', numero: 'STR-1480-F-1', cliente_id: 10, comprador_nome: 'BRIZA LUCCI MAUSE', obra_codigo_legado: 7698, unidade_codigo_legado: 'F-1', status: 'assinado' }] }
      }
      if (sql.includes('FROM com_parcelas p')) {
        const number = Number(params[2])
        return { rows: [{
          id: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
          contrato_id: '45c5d783-159d-49fd-8508-d4eee69c10b2',
          contrato_numero: 'STR-1480-F-1',
          documento_legado: `1366 ${number}/37`,
          parcela_numero_legado: number,
          parcela_total_legado: 37,
          numero: number,
          vencimento: params[4],
          valor_nominal: 2061.25,
          valor_recalculado: null,
          valor_correcao: 0,
          valor_multa: 0,
          valor_juros_mora: 0,
          valor_outros_acrescimos: 0,
          valor_seguro: 0,
          valor_desconto: 0,
          valor_pago: null,
          pago_em: null,
          status: 'aberta',
          movimento_id: null,
          nosso_numero: null,
          nosso_numero_dv: null,
          controle_participante: null,
        }] }
      }
      throw new Error(`Consulta não simulada: ${sql.slice(0, 80)}`)
    },
  }
}

async function main() {
  assert.strictEqual(fractionsEquivalent({ number: 52, total: 120 }, { number: 13, total: 30 }), true)
  assert.strictEqual(fractionsEquivalent({ number: 14, total: 120 }, { number: 7, total: 60 }), true)

  const parsedRaw = parseStratoPdfText(sampleText)
  const parsedReport = normalizeStratoReport(parsedRaw, { filename: 'RET 23072026 LUCKY.pdf', provider: 'teste' })
  assert.strictEqual(parsedReport.titulos.length, 2)
  assert.strictEqual(parsedReport.titulos[0].valor_desconto, 225.73)
  assert.strictEqual(parsedReport.titulos[0].valor_pago, 1847.48)
  assert.strictEqual(parsedReport.titulos[0].data_pagamento, '2026-07-22')

  const report = { nome_arquivo_relatorio: 'RET 23072026 LUCKY.pdf', titulos: makeRows() }
  const groups = groupReportRows([report])
  assert.strictEqual(groups.length, 1)
  assert.strictEqual(groups[0].rows.length, 10)
  assert.strictEqual(groups[0].totais.valor_desconto, 2257.30)
  assert.strictEqual(groups[0].totais.valor_pago, 18474.80)

  const reconciled = reconcileGroupRounding(groups[0], 18474.79)
  assert.strictEqual(reconciled.adjusted, true)
  assert.strictEqual(reconciled.group.totais.valor_pago, 18474.79)
  assert.strictEqual(reconciled.group.rows[9].valor_pago, 1847.47)
  assert.strictEqual(reconciled.group.rows[9].valor_desconto, 225.74)

  const result = await analyzeStratoMultiParcelReturn({
    client: fakeClient(),
    tenantId: 'a1000000-0000-4000-8000-000000000001',
    parsed: {
      filename: 'CB230700 LUCKY .RET',
      header: { companyName: 'LUCKY CAPITAL EMPREENDIMENTOS', creditDate: '2026-07-23' },
      details: [{
        lineNumber: 7,
        nossoNumeroWithDv: '260000392183',
        nossoNumero: '26000039218',
        nossoNumeroDv: '3',
        occurrence: '06',
        occurrenceLabel: 'Liquidação normal',
        occurrenceDate: '2026-07-22',
        creditDate: '2026-07-23',
        documentNumber: '18a27-ANT',
        titleAmount: 18474.79,
        paidAmount: 18474.79,
      }],
    },
    stratoReports: [report],
    explicitCompany: 'LUCKY',
  })

  assert.strictEqual(result.modo, 'ANALISE_PARA_APROVACAO')
  assert.strictEqual(result.itens[0].quantidade_parcelas, 10)
  assert.strictEqual(result.itens[0].soma_confere_com_retorno, true)
  assert.strictEqual(result.itens[0].data_recebimento, '2026-07-22')
  assert.strictEqual(result.itens[0].ajuste_arredondamento.valor, -0.01)
  assert.strictEqual(result.resumo.valor_desconto, 2257.31)
  assert.strictEqual(result.resumo.valor_pago, 18474.79)
  assert.strictEqual(result.requer_fluxo_inteligente, true)
  assert.strictEqual(result.seguranca.executa_baixa, false)

  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'))
  assert.strictEqual(pkg.version, '0.6.6')
  assert.strictEqual(pkg.scripts['db:migrate:system-releases'], 'node scripts/migrate_system_releases.js')
  const releases = require('../src/data/system_releases_seed').SYSTEM_RELEASES
  assert.strictEqual(releases[0].version, '0.6.6')

  const routeSource = fs.readFileSync(path.join(__dirname, '../src/routes/recebiveis.js'), 'utf8')
  assert(routeSource.includes('analyzeStratoMultiParcelReturn'))
  assert(routeSource.includes('Nenhuma baixa foi executada'))
  const serviceSource = fs.readFileSync(path.join(__dirname, '../src/services/stratoMultiParcelAnalysisService.js'), 'utf8')
  assert(!/\b(INSERT|UPDATE|DELETE)\s+INTO\b/i.test(serviceSource))

  console.log('Análise inteligente Strato 0.6.6: multiparcelas, descontos, arredondamento, cadastros e bloqueio de escrita conferidos.')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
