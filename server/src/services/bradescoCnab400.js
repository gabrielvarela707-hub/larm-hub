const crypto = require('crypto')

function onlyDigits(value = '') {
  return String(value ?? '').replace(/\D/g, '')
}

function normalizeText(value = '') {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 .,/\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function padRight(value, length, fill = ' ') {
  return String(value ?? '').slice(0, length).padEnd(length, fill)
}

function padLeft(value, length, fill = '0') {
  return String(value ?? '').slice(-length).padStart(length, fill)
}

function moneyField(value, length = 13) {
  const cents = Math.max(0, Math.round(Number(value || 0) * 100))
  return padLeft(cents, length)
}

function percentField(value, length = 4) {
  const hundredths = Math.max(0, Math.round(Number(value || 0) * 100))
  return padLeft(hundredths, length)
}

function formatDate6(value) {
  const date = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(date.getTime())) throw new Error(`Data inválida: ${value}`)
  return `${String(date.getDate()).padStart(2, '0')}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getFullYear()).slice(-2)}`
}

function parseDate6(value) {
  const digits = onlyDigits(value)
  if (digits.length !== 6 || digits === '000000') return null
  const day = Number(digits.slice(0, 2))
  const month = Number(digits.slice(2, 4))
  const year2 = Number(digits.slice(4, 6))
  const year = year2 >= 70 ? 1900 + year2 : 2000 + year2
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date.toISOString().slice(0, 10)
}

function modulo10(value) {
  let factor = 2
  let total = 0
  for (let i = value.length - 1; i >= 0; i -= 1) {
    const product = Number(value[i]) * factor
    total += product > 9 ? Math.floor(product / 10) + (product % 10) : product
    factor = factor === 2 ? 1 : 2
  }
  const rest = total % 10
  return rest === 0 ? 0 : 10 - rest
}

function nossoNumeroDv(carteira, nossoNumero) {
  const base = `${padLeft(onlyDigits(carteira), 2)}${padLeft(onlyDigits(nossoNumero), 11)}`
  const weights = [2, 3, 4, 5, 6, 7]
  let total = 0
  for (let i = 0; i < base.length; i += 1) {
    total += Number(base[base.length - 1 - i]) * weights[i % weights.length]
  }
  const digit = 11 - (total % 11)
  if (digit === 10) return 'P'
  if (digit === 11) return '0'
  return String(digit)
}

function barcodeDv(withoutDv) {
  let factor = 2
  let total = 0
  for (let i = withoutDv.length - 1; i >= 0; i -= 1) {
    total += Number(withoutDv[i]) * factor
    factor += 1
    if (factor > 9) factor = 2
  }
  const result = 11 - (total % 11)
  return result === 0 || result === 1 || result > 9 ? '1' : String(result)
}

function dueFactor(value) {
  const due = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(due.getTime())) throw new Error('Data de vencimento inválida para o boleto')
  const base = new Date('2025-02-22T00:00:00Z')
  const days = Math.floor((Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()) - base.getTime()) / 86400000)
  const factor = 1000 + days
  if (factor < 1000 || factor > 9999) throw new Error('Data de vencimento fora da faixa suportada pelo fator de vencimento atual')
  return String(factor).padStart(4, '0')
}

function buildBarcode({ agency, wallet, nossoNumero, account, dueDate, amount }) {
  const freeField = `${padLeft(onlyDigits(agency), 4)}${padLeft(onlyDigits(wallet), 2)}${padLeft(onlyDigits(nossoNumero), 11)}${padLeft(onlyDigits(account), 7)}0`
  const factor = dueFactor(dueDate)
  const value = moneyField(amount, 10)
  const withoutDv = `2379${factor}${value}${freeField}`
  const dv = barcodeDv(withoutDv)
  const barcode = `2379${dv}${factor}${value}${freeField}`

  const field1Base = `${barcode.slice(0, 4)}${freeField.slice(0, 5)}`
  const field2Base = freeField.slice(5, 15)
  const field3Base = freeField.slice(15, 25)
  const field1 = `${field1Base.slice(0, 5)}.${field1Base.slice(5)}${modulo10(field1Base)}`
  const field2 = `${field2Base.slice(0, 5)}.${field2Base.slice(5)}${modulo10(field2Base)}`
  const field3 = `${field3Base.slice(0, 5)}.${field3Base.slice(5)}${modulo10(field3Base)}`
  const digitableLine = `${field1} ${field2} ${field3} ${dv} ${factor}${value}`

  return { barcode, digitableLine, generalDv: dv, dueFactor: factor, freeField }
}

const I25_PATTERNS = {
  '0': '00110', '1': '10001', '2': '01001', '3': '11000', '4': '00101',
  '5': '10100', '6': '01100', '7': '00011', '8': '10010', '9': '01010',
}

function barcodeSvg(value) {
  let digits = onlyDigits(value)
  if (digits.length % 2 !== 0) digits = `0${digits}`
  const narrow = 2
  const wide = 6
  const height = 58
  let x = 0
  const bars = []
  const add = (isBar, width) => {
    if (isBar) bars.push(`<rect x="${x}" y="0" width="${width}" height="${height}" fill="#000"/>`)
    x += width
  }
  ;[1, 1, 1, 1].forEach((width, index) => add(index % 2 === 0, width * narrow))
  for (let i = 0; i < digits.length; i += 2) {
    const barsPattern = I25_PATTERNS[digits[i]]
    const spacesPattern = I25_PATTERNS[digits[i + 1]]
    for (let j = 0; j < 5; j += 1) {
      add(true, barsPattern[j] === '1' ? wide : narrow)
      add(false, spacesPattern[j] === '1' ? wide : narrow)
    }
  }
  add(true, wide)
  add(false, narrow)
  add(true, narrow)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x} ${height}" preserveAspectRatio="none" role="img" aria-label="Código de barras"><rect width="100%" height="100%" fill="#fff"/>${bars.join('')}</svg>`
}

function buildBoletoData(config, parcel) {
  const nossoNumero = padLeft(onlyDigits(parcel.nosso_numero), 11)
  if (!nossoNumero || /^0+$/.test(nossoNumero)) throw new Error('Nosso número não foi atribuído')
  const nossoDv = parcel.nosso_numero_dv || nossoNumeroDv(config.carteira, nossoNumero)
  const amount = Number(parcel.valor_total || parcel.valor_recalculado || parcel.valor_nominal || 0)
  const barcode = buildBarcode({
    agency: config.agencia,
    wallet: config.carteira,
    nossoNumero,
    account: config.conta,
    dueDate: parcel.vencimento_boleto || parcel.vencimento,
    amount,
  })

  return {
    bankCode: '237-2',
    bankName: 'Bradesco',
    wallet: padLeft(onlyDigits(config.carteira), 2),
    nossoNumero,
    nossoNumeroDv: nossoDv,
    nossoNumeroDisplay: `${padLeft(onlyDigits(config.carteira), 2)}/${nossoNumero}-${nossoDv}`,
    agencyAccount: `${padLeft(onlyDigits(config.agencia), 4)}-${config.agencia_dv || ''}/${padLeft(onlyDigits(config.conta), 7)}-${config.conta_dv || ''}`,
    ...barcode,
    amount,
  }
}

function formatMoneyBr(value) {
  return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDateBr(value) {
  if (!value) return ''
  const [year, month, day] = String(value).slice(0, 10).split('-')
  return year && month && day ? `${day}/${month}/${year}` : String(value)
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function buildBoletoHtml(config, parcel) {
  const boleto = buildBoletoData(config, parcel)
  const payerAddress = [parcel.cliente_logradouro, parcel.cliente_numero, parcel.cliente_complemento, parcel.cliente_bairro, parcel.cliente_cidade, parcel.cliente_uf, parcel.cliente_cep]
    .filter(Boolean).join(' - ')
  const beneficiaryAddress = [config.logradouro, config.numero, config.complemento, config.bairro, config.cidade, config.uf, config.cep]
    .filter(Boolean).join(' - ')
  const instructions = [
    config.instrucoes,
    Number(parcel.valor_multa || 0) > 0 ? `Multa: R$ ${formatMoneyBr(parcel.valor_multa)}` : '',
    Number(parcel.valor_juros_mora || 0) > 0 ? `Juros/Mora: R$ ${formatMoneyBr(parcel.valor_juros_mora)}` : '',
    Number(parcel.valor_correcao || 0) !== 0 ? `Correção monetária: R$ ${formatMoneyBr(parcel.valor_correcao)}` : '',
  ].filter(Boolean).join(' • ')
  const watermark = config.homologado ? '' : '<div class="watermark">HOMOLOGAÇÃO — VALIDAR NO BRADESCO</div>'

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Boleto Bradesco ${htmlEscape(parcel.documento || parcel.id)}</title><style>
  *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:18px;background:#fff}.sheet{max-width:980px;margin:auto;position:relative}.watermark{position:fixed;top:42%;left:12%;transform:rotate(-20deg);font-size:44px;color:rgba(180,0,0,.12);font-weight:700;z-index:9;pointer-events:none}.section{border:1px solid #111;margin-bottom:12px}.row{display:grid;border-bottom:1px solid #111}.row:last-child{border-bottom:0}.c{padding:4px 7px;border-right:1px solid #111;min-height:36px}.c:last-child{border-right:0}.label{font-size:9px;color:#333;text-transform:uppercase}.value{font-size:12px;font-weight:600;margin-top:3px}.header{grid-template-columns:180px 90px 1fr;align-items:center}.header .bank{font-size:22px;font-weight:800}.line{font-size:18px;letter-spacing:1px;text-align:right;white-space:nowrap}.g2{grid-template-columns:1fr 180px}.g3{grid-template-columns:1fr 180px 180px}.g4{grid-template-columns:1fr 150px 150px 150px}.instructions{min-height:88px}.barcode{height:70px;padding:6px 8px}.barcode svg{width:100%;height:58px}.cut{border-top:1px dashed #777;margin:15px 0}.actions{max-width:980px;margin:0 auto 12px;display:flex;gap:8px}.actions button{padding:8px 14px;border:1px solid #ccc;border-radius:7px;background:#fff;cursor:pointer}@media print{.actions{display:none}.watermark{display:${config.homologado ? 'none' : 'block'}}body{margin:0}.sheet{max-width:none}}
  </style></head><body><div class="actions"><button onclick="window.print()">Imprimir / Salvar PDF</button><button onclick="window.close()">Fechar</button></div><div class="sheet">${watermark}
  <div class="section"><div class="row header"><div class="c bank">Bradesco</div><div class="c value">237-2</div><div class="c line">${htmlEscape(boleto.digitableLine)}</div></div>
  <div class="row g2"><div class="c"><div class="label">Local de pagamento</div><div class="value">${htmlEscape(config.local_pagamento || 'Pagável preferencialmente na rede Bradesco ou em qualquer banco até o vencimento.')}</div></div><div class="c"><div class="label">Vencimento</div><div class="value">${formatDateBr(parcel.vencimento_boleto || parcel.vencimento)}</div></div></div>
  <div class="row g2"><div class="c"><div class="label">Beneficiário</div><div class="value">${htmlEscape(config.beneficiario_nome)} — ${htmlEscape(config.beneficiario_documento || '')}</div><div>${htmlEscape(beneficiaryAddress)}</div></div><div class="c"><div class="label">Agência / Código do Beneficiário</div><div class="value">${htmlEscape(boleto.agencyAccount)}</div></div></div>
  <div class="row g4"><div class="c"><div class="label">Data do documento</div><div class="value">${formatDateBr(parcel.data_emissao || new Date().toISOString().slice(0,10))}</div></div><div class="c"><div class="label">Número do documento</div><div class="value">${htmlEscape(parcel.documento || '')}</div></div><div class="c"><div class="label">Espécie</div><div class="value">DM</div></div><div class="c"><div class="label">Aceite</div><div class="value">N</div></div></div>
  <div class="row g4"><div class="c"><div class="label">Uso do banco</div></div><div class="c"><div class="label">Carteira</div><div class="value">${htmlEscape(boleto.wallet)}</div></div><div class="c"><div class="label">Nosso número</div><div class="value">${htmlEscape(boleto.nossoNumeroDisplay)}</div></div><div class="c"><div class="label">Valor do documento</div><div class="value">R$ ${formatMoneyBr(boleto.amount)}</div></div></div>
  <div class="row g2"><div class="c instructions"><div class="label">Instruções</div><div class="value">${htmlEscape(instructions || 'Não receber após a data limite sem atualização do valor.')}</div></div><div><div class="c"><div class="label">(-) Desconto / Abatimento</div><div class="value">R$ ${formatMoneyBr(parcel.valor_desconto || 0)}</div></div><div class="c"><div class="label">(+) Mora / Multa</div><div class="value">R$ ${formatMoneyBr(Number(parcel.valor_multa || 0)+Number(parcel.valor_juros_mora || 0)+Number(parcel.valor_outros_acrescimos || 0))}</div></div><div class="c"><div class="label">(=) Valor cobrado</div><div class="value">R$ ${formatMoneyBr(boleto.amount)}</div></div></div></div>
  <div class="row"><div class="c"><div class="label">Pagador</div><div class="value">${htmlEscape(parcel.cliente_nome || '')} — ${htmlEscape(parcel.cliente_documento || '')}</div><div>${htmlEscape(payerAddress)}</div><div class="value">Contrato ${htmlEscape(parcel.contrato_numero || '')} • ${htmlEscape(parcel.obra_nome || '')} • Unidade ${htmlEscape(parcel.unidade_nome || '')}</div></div></div></div>
  <div class="cut"></div>
  <div class="section"><div class="row header"><div class="c bank">Bradesco</div><div class="c value">237-2</div><div class="c line">${htmlEscape(boleto.digitableLine)}</div></div><div class="row g2"><div class="c"><div class="label">Beneficiário</div><div class="value">${htmlEscape(config.beneficiario_nome)}</div></div><div class="c"><div class="label">Vencimento</div><div class="value">${formatDateBr(parcel.vencimento_boleto || parcel.vencimento)}</div></div></div><div class="row g3"><div class="c"><div class="label">Pagador</div><div class="value">${htmlEscape(parcel.cliente_nome || '')}</div></div><div class="c"><div class="label">Nosso número</div><div class="value">${htmlEscape(boleto.nossoNumeroDisplay)}</div></div><div class="c"><div class="label">Valor cobrado</div><div class="value">R$ ${formatMoneyBr(boleto.amount)}</div></div></div><div class="barcode">${barcodeSvg(boleto.barcode)}</div></div>
  </div></body></html>`
}

function beneficiaryIdentification(config) {
  return `0${padLeft(onlyDigits(config.carteira), 3)}${padLeft(onlyDigits(config.agencia), 5)}${padLeft(onlyDigits(config.conta), 7)}${padRight(config.conta_dv || '0', 1, '0')}`
}

function buildHeader(config, remittanceNumber, generatedAt = new Date()) {
  return [
    '0', '1', 'REMESSA', '01', padRight('COBRANCA', 15),
    padLeft(onlyDigits(config.codigo_empresa), 20),
    padRight(normalizeText(config.beneficiario_nome), 30),
    '237', padRight('BANCO BRADESCO', 15), formatDate6(generatedAt),
    ' '.repeat(8), 'MX', padLeft(remittanceNumber, 7), ' '.repeat(277), '000001',
  ].join('')
}

function buildDetail(config, item, sequence, generatedAt = new Date()) {
  const document = normalizeText(item.documento || item.parcela_id || '').slice(0, 10)
  const payerDigits = onlyDigits(item.cliente_documento)
  const payerType = payerDigits.length <= 11 ? '01' : '02'
  const address = normalizeText([item.cliente_logradouro, item.cliente_numero, item.cliente_complemento].filter(Boolean).join(' '))
  const cep = padLeft(onlyDigits(item.cliente_cep), 8)
  const multaPercent = Number(item.multa_percentual ?? config.multa_percentual_padrao ?? 0)
  const moraDay = Number(item.mora_dia || 0)
  const nossoNumber = padLeft(onlyDigits(item.nosso_numero), 11)
  const nossoDv = item.nosso_numero_dv || nossoNumeroDv(config.carteira, nossoNumber)

  const fields = [
    '1', '0'.repeat(19), beneficiaryIdentification(config),
    padRight(item.controle_participante || `CR${String(item.parcela_id).replace(/-/g, '')}`, 25),
    '000', multaPercent > 0 ? '2' : '0', multaPercent > 0 ? percentField(multaPercent, 4) : '0000',
    nossoNumber, nossoDv, '0'.repeat(10), '2', 'N', ' '.repeat(10), ' ', '2', '  ', '01',
    padRight(document, 10), formatDate6(item.vencimento_boleto || item.vencimento), moneyField(item.valor_total),
    '000', '00000', padLeft(item.especie_documento || config.especie_documento || '01', 2), 'N', formatDate6(generatedAt),
    padLeft(item.instrucao_1 || '00', 2), padLeft(item.instrucao_2 || '00', 2), moneyField(moraDay),
    '000000', moneyField(0), moneyField(0), moneyField(item.valor_desconto || 0),
    payerType, padLeft(payerDigits, 14), padRight(normalizeText(item.cliente_nome), 40),
    padRight(address, 40), padRight(normalizeText(item.unidade_nome || ''), 12), cep.slice(0, 5), cep.slice(5, 8),
    ' '.repeat(60), padLeft(sequence, 6),
  ]
  const line = fields.join('')
  if (line.length !== 400) throw new Error(`Registro CNAB gerado com ${line.length} posições; esperado 400`)
  return line
}

function buildTrailer(sequence) {
  return `9${' '.repeat(393)}${padLeft(sequence, 6)}`
}

function buildRemittance(config, items, remittanceNumber, generatedAt = new Date()) {
  if (!items.length) throw new Error('Nenhuma parcela selecionada para a remessa')
  const lines = [buildHeader(config, remittanceNumber, generatedAt)]
  items.forEach((item, index) => lines.push(buildDetail(config, item, index + 2, generatedAt)))
  lines.push(buildTrailer(lines.length + 1))
  lines.forEach((line, index) => {
    if (line.length !== 400) throw new Error(`Linha ${index + 1} possui ${line.length} posições`) 
  })
  const day = String(generatedAt.getDate()).padStart(2, '0')
  const month = String(generatedAt.getMonth() + 1).padStart(2, '0')
  const suffix = String(remittanceNumber).slice(-2).padStart(2, '0')
  const extension = config.homologado ? 'REM' : 'TST'
  return {
    filename: `CB${day}${month}${suffix}.${extension}`,
    content: `${lines.join('\r\n')}\r\n`,
    records: lines.length,
  }
}

const OCCURRENCES = {
  '02': 'Entrada confirmada',
  '03': 'Entrada rejeitada',
  '06': 'Liquidação normal',
  '09': 'Baixado automaticamente via arquivo',
  '10': 'Baixado conforme instruções da agência',
  '15': 'Liquidação em cartório',
  '17': 'Liquidação após baixa ou título não registrado',
  '28': 'Débito de tarifa',
  '29': 'Ocorrência bancária',
}

function parseReturn(content) {
  const normalized = String(content || '').replace(/\u001a/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n').filter(line => line.length > 0)
  if (!lines.length) throw new Error('Arquivo de retorno vazio')
  const invalid = lines.findIndex(line => line.length !== 400)
  if (invalid >= 0) throw new Error(`Linha ${invalid + 1} possui ${lines[invalid].length} posições; esperado 400`)
  const header = lines[0]
  if (header[0] !== '0' || header.slice(76, 79) !== '237') throw new Error('Arquivo não identificado como retorno CNAB 400 Bradesco')
  const details = lines.filter(line => line[0] === '1').map((line, index) => {
    const occurrence = line.slice(108, 110)
    return {
      lineNumber: index + 2,
      companyDocument: line.slice(3, 17).trim(),
      beneficiaryIdentification: line.slice(20, 37),
      participantControl: line.slice(37, 62).trim(),
      nossoNumeroWithDv: line.slice(70, 82).trim(),
      nossoNumero: line.slice(70, 81).trim(),
      nossoNumeroDv: line.slice(81, 82).trim(),
      occurrence,
      occurrenceLabel: OCCURRENCES[occurrence] || `Ocorrência ${occurrence}`,
      occurrenceDate: parseDate6(line.slice(110, 116)),
      documentNumber: line.slice(116, 126).trim(),
      bankTitleIdentification: line.slice(126, 146).trim(),
      dueDate: parseDate6(line.slice(146, 152)),
      titleAmount: Number(line.slice(152, 165)) / 100,
      collectingBank: line.slice(165, 168),
      collectingAgency: line.slice(168, 173),
      collectionExpenses: Number(line.slice(175, 188)) / 100,
      otherExpenses: Number(line.slice(188, 201)) / 100,
      iof: Number(line.slice(214, 227)) / 100,
      rebate: Number(line.slice(227, 240)) / 100,
      discount: Number(line.slice(240, 253)) / 100,
      paidAmount: Number(line.slice(253, 266)) / 100,
      interestAmount: Number(line.slice(266, 279)) / 100,
      otherCredits: Number(line.slice(279, 292)) / 100,
      creditDate: parseDate6(line.slice(295, 301)),
      paymentOrigin: line.slice(301, 304).trim(),
      rejectionReasons: line.slice(318, 328).trim(),
      raw: line,
    }
  })
  return {
    header: {
      companyCode: header.slice(26, 46).trim(),
      companyName: header.slice(46, 76).trim(),
      fileDate: parseDate6(header.slice(94, 100)),
      creditDate: parseDate6(header.slice(379, 385)),
    },
    details,
    sha256: crypto.createHash('sha256').update(normalized, 'latin1').digest('hex'),
    recordCount: lines.length,
  }
}

module.exports = {
  buildBoletoData,
  buildBoletoHtml,
  buildRemittance,
  nossoNumeroDv,
  parseReturn,
  onlyDigits,
  normalizeText,
}
