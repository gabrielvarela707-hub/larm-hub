/**
 * server/src/routes/fornecedor_contratos.js
 * Gestão de contratos vinculados aos fornecedores.
 */

const express = require('express')
const { query } = require('../config/database')
const { authenticate } = require('../middleware/authenticate')

const router = express.Router()
router.use(authenticate)

const STATUS_VALIDOS = new Set([
  'ativo',
  'pendente_assinatura',
  'em_renovacao',
  'vencido',
  'encerrado',
  'cancelado',
])

function textOrNull(value) {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  return text ? text : null
}

function moneyOrZero(value) {
  if (value === undefined || value === null || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const n = Number(String(value)
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function dateOrNull(value) {
  const text = textOrNull(value)
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
  return null
}

function statusOrDefault(value) {
  const status = textOrNull(value) || 'ativo'
  return STATUS_VALIDOS.has(status) ? status : 'ativo'
}

function normalizeContratoPayload(body = {}) {
  return {
    titulo: textOrNull(body.titulo),
    numero_contrato: textOrNull(body.numero_contrato),
    status: statusOrDefault(body.status),
    data_assinatura: dateOrNull(body.data_assinatura),
    data_inicio: dateOrNull(body.data_inicio),
    data_fim: dateOrNull(body.data_fim),
    data_renovacao: dateOrNull(body.data_renovacao),
    indice_correcao: textOrNull(body.indice_correcao),
    valor_mensal: moneyOrZero(body.valor_mensal),
    valor_total: moneyOrZero(body.valor_total),
    valor_pago: moneyOrZero(body.valor_pago),
    servicos: textOrNull(body.servicos),
    responsavel: textOrNull(body.responsavel),
    observacoes: textOrNull(body.observacoes),
    arquivo_nome: textOrNull(body.arquivo_nome),
    arquivo_mime: textOrNull(body.arquivo_mime),
    arquivo_base64: textOrNull(body.arquivo_base64),
    ativo: body.ativo === undefined ? true : Boolean(body.ativo),
  }
}

function csvEscape(value) {
  if (value === null || value === undefined) return ''
  return `"${String(value).replace(/"/g, '""')}"`
}

async function fornecedorExiste(id) {
  const { rows } = await query('SELECT id FROM fin_fornecedores WHERE id=$1', [id])
  return rows.length > 0
}

const SELECT_CONTRATOS = `
  SELECT
    id,
    fornecedor_id,
    titulo,
    numero_contrato,
    status,
    TO_CHAR(data_assinatura, 'YYYY-MM-DD') AS data_assinatura,
    TO_CHAR(data_inicio, 'YYYY-MM-DD') AS data_inicio,
    TO_CHAR(data_fim, 'YYYY-MM-DD') AS data_fim,
    TO_CHAR(data_renovacao, 'YYYY-MM-DD') AS data_renovacao,
    indice_correcao,
    valor_mensal::float AS valor_mensal,
    valor_total::float AS valor_total,
    valor_pago::float AS valor_pago,
    servicos,
    responsavel,
    observacoes,
    arquivo_nome,
    arquivo_mime,
    (arquivo_base64 IS NOT NULL AND arquivo_base64 <> '') AS tem_arquivo,
    ativo,
    created_at,
    updated_at
  FROM fin_fornecedor_contratos
`

// GET /financeiro/fornecedores/:id/contratos
router.get('/:id/contratos', async (req, res) => {
  try {
    const { rows } = await query(
      `${SELECT_CONTRATOS}
       WHERE fornecedor_id=$1 AND ativo=true
       ORDER BY COALESCE(data_renovacao, data_fim, data_inicio) NULLS LAST, titulo`,
      [req.params.id],
    )
    return res.json({ ok: true, data: rows })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// GET /financeiro/fornecedores/:id/contratos/exportar
router.get('/:id/contratos/exportar', async (req, res) => {
  try {
    const { rows } = await query(
      `${SELECT_CONTRATOS}
       WHERE fornecedor_id=$1
       ORDER BY COALESCE(data_renovacao, data_fim, data_inicio) NULLS LAST, titulo`,
      [req.params.id],
    )

    const fields = [
      'titulo', 'numero_contrato', 'status', 'data_assinatura', 'data_inicio', 'data_fim',
      'data_renovacao', 'indice_correcao', 'valor_mensal', 'valor_total', 'valor_pago',
      'servicos', 'responsavel', 'observacoes', 'arquivo_nome', 'ativo',
    ]
    const csv = [
      fields.join(';'),
      ...rows.map(row => fields.map(field => csvEscape(row[field])).join(';')),
    ].join('\n')

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename=contratos_fornecedor.csv')
    return res.send(`\ufeff${csv}`)
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// POST /financeiro/fornecedores/:id/contratos/importar
router.post('/:id/contratos/importar', async (req, res) => {
  const contratos = Array.isArray(req.body?.contratos) ? req.body.contratos : []
  if (!contratos.length) return res.status(400).json({ ok: false, message: 'Nenhum contrato válido enviado.' })
  if (contratos.length > 100) return res.status(400).json({ ok: false, message: 'Envie no máximo 100 contratos por ciclo.' })

  const fornecedorId = Number(req.params.id)
  if (!await fornecedorExiste(fornecedorId)) return res.status(404).json({ ok: false, message: 'Fornecedor não encontrado.' })

  const result = { created: 0, updated: 0, skipped: 0, errors: [] }
  const client = await require('../config/database').pool.connect()

  try {
    await client.query('BEGIN')
    for (let index = 0; index < contratos.length; index += 1) {
      const rowNumber = index + 1
      const contrato = normalizeContratoPayload(contratos[index])
      if (!contrato.titulo) {
        result.skipped += 1
        result.errors.push(`Linha ${rowNumber}: título/serviço é obrigatório.`)
        continue
      }

      let existingId = null
      if (contrato.numero_contrato) {
        const existing = await client.query(
          `SELECT id FROM fin_fornecedor_contratos
           WHERE fornecedor_id=$1 AND numero_contrato=$2 LIMIT 1`,
          [fornecedorId, contrato.numero_contrato],
        )
        existingId = existing.rows[0]?.id || null
      }

      const values = [
        contrato.titulo,
        contrato.numero_contrato,
        contrato.status,
        contrato.data_assinatura,
        contrato.data_inicio,
        contrato.data_fim,
        contrato.data_renovacao,
        contrato.indice_correcao,
        contrato.valor_mensal,
        contrato.valor_total,
        contrato.valor_pago,
        contrato.servicos,
        contrato.responsavel,
        contrato.observacoes,
        contrato.ativo,
      ]

      if (existingId) {
        await client.query(
          `UPDATE fin_fornecedor_contratos SET
             titulo=$1, numero_contrato=$2, status=$3, data_assinatura=$4, data_inicio=$5,
             data_fim=$6, data_renovacao=$7, indice_correcao=$8, valor_mensal=$9,
             valor_total=$10, valor_pago=$11, servicos=$12, responsavel=$13,
             observacoes=$14, ativo=$15, updated_at=NOW()
           WHERE id=$16 AND fornecedor_id=$17`,
          [...values, existingId, fornecedorId],
        )
        result.updated += 1
      } else {
        await client.query(
          `INSERT INTO fin_fornecedor_contratos
             (fornecedor_id, tenant_id, titulo, numero_contrato, status, data_assinatura, data_inicio,
              data_fim, data_renovacao, indice_correcao, valor_mensal, valor_total, valor_pago,
              servicos, responsavel, observacoes, ativo)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [fornecedorId, req.user?.tenant_id || null, ...values],
        )
        result.created += 1
      }
    }
    await client.query('COMMIT')
    return res.json({ ok: true, data: result })
  } catch (err) {
    await client.query('ROLLBACK')
    return res.status(500).json({ ok: false, message: err.message })
  } finally {
    client.release()
  }
})

// POST /financeiro/fornecedores/:id/contratos
router.post('/:id/contratos', async (req, res) => {
  const fornecedorId = Number(req.params.id)
  const contrato = normalizeContratoPayload(req.body)
  if (!contrato.titulo) return res.status(400).json({ ok: false, message: 'Título / serviço do contrato é obrigatório.' })

  try {
    if (!await fornecedorExiste(fornecedorId)) return res.status(404).json({ ok: false, message: 'Fornecedor não encontrado.' })

    const { rows } = await query(
      `INSERT INTO fin_fornecedor_contratos
        (fornecedor_id, tenant_id, titulo, numero_contrato, status, data_assinatura, data_inicio,
         data_fim, data_renovacao, indice_correcao, valor_mensal, valor_total, valor_pago,
         servicos, responsavel, observacoes, arquivo_nome, arquivo_mime, arquivo_base64, ativo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [
        fornecedorId,
        req.user?.tenant_id || null,
        contrato.titulo,
        contrato.numero_contrato,
        contrato.status,
        contrato.data_assinatura,
        contrato.data_inicio,
        contrato.data_fim,
        contrato.data_renovacao,
        contrato.indice_correcao,
        contrato.valor_mensal,
        contrato.valor_total,
        contrato.valor_pago,
        contrato.servicos,
        contrato.responsavel,
        contrato.observacoes,
        contrato.arquivo_nome,
        contrato.arquivo_mime,
        contrato.arquivo_base64,
        contrato.ativo,
      ],
    )
    return res.status(201).json({ ok: true, data: rows[0] })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// PUT /financeiro/fornecedores/:id/contratos/:contratoId
router.put('/:id/contratos/:contratoId', async (req, res) => {
  const contrato = normalizeContratoPayload(req.body)
  if (!contrato.titulo) return res.status(400).json({ ok: false, message: 'Título / serviço do contrato é obrigatório.' })

  try {
    const { rows } = await query(
      `UPDATE fin_fornecedor_contratos SET
         titulo=$1, numero_contrato=$2, status=$3, data_assinatura=$4, data_inicio=$5,
         data_fim=$6, data_renovacao=$7, indice_correcao=$8, valor_mensal=$9,
         valor_total=$10, valor_pago=$11, servicos=$12, responsavel=$13, observacoes=$14,
         arquivo_nome=COALESCE($15, arquivo_nome), arquivo_mime=COALESCE($16, arquivo_mime),
         arquivo_base64=COALESCE($17, arquivo_base64), ativo=$18, updated_at=NOW()
       WHERE id=$19 AND fornecedor_id=$20
       RETURNING *`,
      [
        contrato.titulo,
        contrato.numero_contrato,
        contrato.status,
        contrato.data_assinatura,
        contrato.data_inicio,
        contrato.data_fim,
        contrato.data_renovacao,
        contrato.indice_correcao,
        contrato.valor_mensal,
        contrato.valor_total,
        contrato.valor_pago,
        contrato.servicos,
        contrato.responsavel,
        contrato.observacoes,
        contrato.arquivo_nome,
        contrato.arquivo_mime,
        contrato.arquivo_base64,
        contrato.ativo,
        req.params.contratoId,
        req.params.id,
      ],
    )
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Contrato não encontrado.' })
    return res.json({ ok: true, data: rows[0] })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// GET /financeiro/fornecedores/:id/contratos/:contratoId/arquivo
router.get('/:id/contratos/:contratoId/arquivo', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT arquivo_nome, arquivo_mime, arquivo_base64
       FROM fin_fornecedor_contratos
       WHERE id=$1 AND fornecedor_id=$2`,
      [req.params.contratoId, req.params.id],
    )
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Contrato não encontrado.' })
    if (!rows[0].arquivo_base64) return res.status(404).json({ ok: false, message: 'Contrato sem PDF anexado.' })
    return res.json({ ok: true, data: rows[0] })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// DELETE /financeiro/fornecedores/:id/contratos/:contratoId — soft delete
router.delete('/:id/contratos/:contratoId', async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE fin_fornecedor_contratos
       SET ativo=false, status='encerrado', updated_at=NOW()
       WHERE id=$1 AND fornecedor_id=$2
       RETURNING id`,
      [req.params.contratoId, req.params.id],
    )
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Contrato não encontrado.' })
    return res.json({ ok: true })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

module.exports = router
