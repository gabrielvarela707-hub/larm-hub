/**
 * server/src/routes/indices-economicos.js
 * Cadastro flexível de índices econômicos mensais.
 *
 * Rotas novas:
 *   GET  /financeiro/indices-economicos/tipos
 *   POST /financeiro/indices-economicos/tipos
 *   GET  /financeiro/indices-economicos/valores
 *   POST /financeiro/indices-economicos/valores
 *
 * Compatibilidade mantida:
 *   GET  /financeiro/indices-economicos
 *   POST /financeiro/indices-economicos
 */

const express = require('express')
const { query } = require('../config/database')
const { authenticate, requireRole } = require('../middleware/authenticate')

const router = express.Router()
router.use(authenticate)

const WRITE_ROLES = ['super_admin', 'admin', 'manager', 'controller', 'financial']

function parsePercentual(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null

  const raw = String(value ?? '')
    .trim()
    .replace(/%/g, '')
    .replace(/\s/g, '')

  if (!raw) return null

  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function parsePercentualOpcional(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  return parsePercentual(value)
}

function referenciaValida(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''))
}

function normalizarCodigo(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_.-]/g, '')
    .slice(0, 30)
}

function erroEstrutura(res) {
  return res.status(503).json({
    ok: false,
    message: 'A estrutura flexível de índices econômicos precisa ser atualizada. Execute a migration da versão 0.3.31.',
  })
}

function validarLimites(valores) {
  return valores
    .filter(value => value !== null)
    .some(value => Math.abs(value) > 100000)
}

async function buscarTipo(tenantId, typeId) {
  const { rows } = await query(
    `SELECT id, codigo, nome, fonte, ativo
       FROM fin_indice_tipos
      WHERE tenant_id = $1 AND id = $2`,
    [tenantId, typeId]
  )
  return rows[0] || null
}

async function garantirTipoPadrao(tenantId, codigo, nome, fonte = null) {
  const { rows: [saved] } = await query(
    `INSERT INTO fin_indice_tipos
       (tenant_id, codigo, nome, fonte, ativo)
     VALUES ($1, $2, $3, $4, TRUE)
     ON CONFLICT (tenant_id, codigo)
     DO UPDATE SET
       nome = EXCLUDED.nome,
       fonte = COALESCE(fin_indice_tipos.fonte, EXCLUDED.fonte),
       ativo = TRUE,
       updated_at = NOW()
     RETURNING id, codigo, nome, fonte, ativo`,
    [tenantId, codigo, nome, fonte]
  )
  return saved
}

async function salvarValor({
  tenantId,
  userId,
  typeId,
  referencia,
  variacaoMensal,
  variacaoPeriodo,
  acumulado12m,
}) {
  const { rows: [saved] } = await query(
    `INSERT INTO fin_indice_valores
       (tenant_id, indice_tipo_id, referencia, variacao_mensal, variacao_periodo,
        acumulado_12m, created_by, updated_by)
     VALUES ($1, $2, $3::date, $4, $5, $6, $7, $7)
     ON CONFLICT (tenant_id, indice_tipo_id, referencia)
     DO UPDATE SET
       variacao_mensal = EXCLUDED.variacao_mensal,
       variacao_periodo = EXCLUDED.variacao_periodo,
       acumulado_12m = EXCLUDED.acumulado_12m,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING id`,
    [
      tenantId,
      typeId,
      `${referencia}-01`,
      variacaoMensal,
      variacaoPeriodo,
      acumulado12m,
      userId,
    ]
  )

  const { rows: [record] } = await query(
    `SELECT
       v.id,
       v.indice_tipo_id,
       t.codigo,
       t.nome,
       t.fonte,
       TO_CHAR(v.referencia, 'YYYY-MM') AS referencia,
       v.variacao_mensal::float8 AS variacao_mensal,
       v.variacao_periodo::float8 AS variacao_periodo,
       v.acumulado_12m::float8 AS acumulado_12m,
       v.created_at,
       v.updated_at
     FROM fin_indice_valores v
     JOIN fin_indice_tipos t ON t.id = v.indice_tipo_id AND t.tenant_id = v.tenant_id
     WHERE v.tenant_id = $1 AND v.id = $2`,
    [tenantId, saved.id]
  )

  return record
}

// GET /financeiro/indices-economicos/tipos
router.get('/indices-economicos/tipos', async (req, res) => {
  const { tenant_id } = req.user

  try {
    const { rows } = await query(
      `SELECT
         id,
         codigo,
         nome,
         fonte,
         ativo,
         created_at,
         updated_at
       FROM fin_indice_tipos
       WHERE tenant_id = $1
         AND ativo = TRUE
       ORDER BY codigo, nome`,
      [tenant_id]
    )

    return res.json({ ok: true, data: rows })
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') return erroEstrutura(res)
    throw err
  }
})

// POST /financeiro/indices-economicos/tipos
router.post(
  '/indices-economicos/tipos',
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    const { tenant_id, id: user_id } = req.user
    const codigo = normalizarCodigo(req.body?.codigo)
    const nome = String(req.body?.nome || '').trim()
    const fonte = String(req.body?.fonte || '').trim() || null

    if (codigo.length < 2) {
      return res.status(400).json({ ok: false, message: 'Informe um código válido para o índice' })
    }

    if (nome.length < 2 || nome.length > 120) {
      return res.status(400).json({ ok: false, message: 'Informe um nome válido para o índice' })
    }

    if (fonte && fonte.length > 160) {
      return res.status(400).json({ ok: false, message: 'A fonte deve possuir no máximo 160 caracteres' })
    }

    try {
      const { rows: [saved] } = await query(
        `INSERT INTO fin_indice_tipos
           (tenant_id, codigo, nome, fonte, ativo, created_by, updated_by)
         VALUES ($1, $2, $3, $4, TRUE, $5, $5)
         ON CONFLICT (tenant_id, codigo)
         DO UPDATE SET
           nome = EXCLUDED.nome,
           fonte = EXCLUDED.fonte,
           ativo = TRUE,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
         RETURNING id, codigo, nome, fonte, ativo, created_at, updated_at`,
        [tenant_id, codigo, nome, fonte, user_id]
      )

      return res.json({
        ok: true,
        message: 'Tipo de índice cadastrado com sucesso',
        data: saved,
      })
    } catch (err) {
      if (err.code === '42P01' || err.code === '42703') return erroEstrutura(res)
      throw err
    }
  }
)

// GET /financeiro/indices-economicos/valores
router.get('/indices-economicos/valores', async (req, res) => {
  const { tenant_id } = req.user
  const ano = req.query.ano ? Number(req.query.ano) : null
  const indiceTipoId = req.query.indice_tipo_id ? Number(req.query.indice_tipo_id) : null

  if (ano !== null && (!Number.isInteger(ano) || ano < 1900 || ano > 2200)) {
    return res.status(400).json({ ok: false, message: 'Ano inválido' })
  }

  if (indiceTipoId !== null && (!Number.isInteger(indiceTipoId) || indiceTipoId <= 0)) {
    return res.status(400).json({ ok: false, message: 'Índice inválido' })
  }

  try {
    const params = [tenant_id]
    const filters = []

    if (ano !== null) {
      params.push(ano)
      filters.push(`EXTRACT(YEAR FROM v.referencia) = $${params.length}`)
    }

    if (indiceTipoId !== null) {
      params.push(indiceTipoId)
      filters.push(`v.indice_tipo_id = $${params.length}`)
    }

    const whereExtra = filters.length ? `AND ${filters.join(' AND ')}` : ''

    const { rows } = await query(
      `SELECT
         v.id,
         v.indice_tipo_id,
         t.codigo,
         t.nome,
         t.fonte,
         TO_CHAR(v.referencia, 'YYYY-MM') AS referencia,
         v.variacao_mensal::float8 AS variacao_mensal,
         v.variacao_periodo::float8 AS variacao_periodo,
         v.acumulado_12m::float8 AS acumulado_12m,
         v.created_at,
         v.updated_at,
         COALESCE(u_updated.name, u_created.name) AS atualizado_por
       FROM fin_indice_valores v
       JOIN fin_indice_tipos t
         ON t.id = v.indice_tipo_id
        AND t.tenant_id = v.tenant_id
       LEFT JOIN hub_users u_created ON u_created.id = v.created_by
       LEFT JOIN hub_users u_updated ON u_updated.id = v.updated_by
       WHERE v.tenant_id = $1
         ${whereExtra}
       ORDER BY v.referencia DESC, t.codigo, v.updated_at DESC`,
      params
    )

    return res.json({ ok: true, data: rows })
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') return erroEstrutura(res)
    throw err
  }
})

// POST /financeiro/indices-economicos/valores
router.post(
  '/indices-economicos/valores',
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    const { tenant_id, id: user_id } = req.user
    const typeId = Number(req.body?.indice_tipo_id)
    const referencia = req.body?.referencia
    const variacaoMensal = parsePercentual(req.body?.variacao_mensal)
    const variacaoPeriodo = parsePercentualOpcional(req.body?.variacao_periodo)
    const acumulado12m = parsePercentualOpcional(req.body?.acumulado_12m)

    if (!Number.isInteger(typeId) || typeId <= 0) {
      return res.status(400).json({ ok: false, message: 'Selecione um índice válido' })
    }

    if (!referenciaValida(referencia)) {
      return res.status(400).json({ ok: false, message: 'Informe o mês de referência no formato AAAA-MM' })
    }

    if (variacaoMensal === null) {
      return res.status(400).json({ ok: false, message: 'Informe uma variação mensal válida' })
    }

    if (validarLimites([variacaoMensal, variacaoPeriodo, acumulado12m])) {
      return res.status(400).json({ ok: false, message: 'Os percentuais informados estão fora do limite permitido' })
    }

    try {
      const type = await buscarTipo(tenant_id, typeId)
      if (!type || !type.ativo) {
        return res.status(404).json({ ok: false, message: 'Índice não encontrado ou inativo' })
      }

      const saved = await salvarValor({
        tenantId: tenant_id,
        userId: user_id,
        typeId,
        referencia,
        variacaoMensal,
        variacaoPeriodo,
        acumulado12m,
      })

      return res.json({
        ok: true,
        message: `${type.codigo} atualizado com sucesso`,
        data: saved,
      })
    } catch (err) {
      if (err.code === '42P01' || err.code === '42703') return erroEstrutura(res)
      throw err
    }
  }
)

/**
 * Endpoint legado mantido para evitar quebra durante deploy gradual do frontend.
 * Retorna apenas IGP-M, IPCA e INCC no formato anterior.
 */
router.get('/indices-economicos', async (req, res) => {
  const { tenant_id } = req.user
  const ano = req.query.ano ? Number(req.query.ano) : null

  if (ano !== null && (!Number.isInteger(ano) || ano < 1900 || ano > 2200)) {
    return res.status(400).json({ ok: false, message: 'Ano inválido' })
  }

  try {
    const params = [tenant_id]
    let whereAno = ''

    if (ano !== null) {
      params.push(ano)
      whereAno = 'AND EXTRACT(YEAR FROM v.referencia) = $2'
    }

    const { rows } = await query(
      `WITH valores AS (
         SELECT
           v.id,
           v.referencia,
           v.variacao_mensal,
           v.acumulado_12m,
           v.created_by,
           v.updated_by,
           v.created_at,
           v.updated_at,
           t.codigo
         FROM fin_indice_valores v
         JOIN fin_indice_tipos t
           ON t.id = v.indice_tipo_id
          AND t.tenant_id = v.tenant_id
         WHERE v.tenant_id = $1
           AND t.codigo IN ('IGPM', 'IPCA', 'INCC')
           ${whereAno}
       ), pivot AS (
         SELECT
           referencia,
           MIN(id) AS id,
           MAX(variacao_mensal) FILTER (WHERE codigo = 'IGPM') AS igpm,
           MAX(variacao_mensal) FILTER (WHERE codigo = 'IPCA') AS ipca,
           MAX(variacao_mensal) FILTER (WHERE codigo = 'INCC') AS incc,
           MAX(acumulado_12m) FILTER (WHERE codigo = 'INCC') AS incc_acumulado_12m,
           MAX(created_at) AS created_at,
           MAX(updated_at) AS updated_at
         FROM valores
         GROUP BY referencia
       )
       SELECT
         p.id,
         TO_CHAR(p.referencia, 'YYYY-MM') AS referencia,
         p.igpm::float8 AS igpm,
         p.ipca::float8 AS ipca,
         p.incc::float8 AS incc,
         p.incc_acumulado_12m::float8 AS incc_acumulado_12m,
         p.created_at,
         p.updated_at,
         auditoria.atualizado_por
       FROM pivot p
       LEFT JOIN LATERAL (
         SELECT COALESCE(u_updated.name, u_created.name) AS atualizado_por
         FROM valores v2
         LEFT JOIN hub_users u_created ON u_created.id = v2.created_by
         LEFT JOIN hub_users u_updated ON u_updated.id = v2.updated_by
         WHERE v2.referencia = p.referencia
         ORDER BY v2.updated_at DESC
         LIMIT 1
       ) auditoria ON TRUE
       ORDER BY p.referencia DESC`,
      params
    )

    return res.json({ ok: true, data: rows })
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') return erroEstrutura(res)
    throw err
  }
})

// Endpoint legado: grava IGP-M, IPCA e INCC no modelo flexível.
router.post(
  '/indices-economicos',
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    const { tenant_id, id: user_id } = req.user
    const { referencia, igpm, ipca, incc, incc_acumulado_12m } = req.body || {}

    if (!referenciaValida(referencia)) {
      return res.status(400).json({ ok: false, message: 'Informe o mês de referência no formato AAAA-MM' })
    }

    const igpmValue = parsePercentual(igpm)
    const ipcaValue = parsePercentual(ipca)
    const inccValue = parsePercentual(incc)
    const inccAcumuladoValue = parsePercentualOpcional(incc_acumulado_12m)

    if (igpmValue === null || ipcaValue === null || inccValue === null) {
      return res.status(400).json({ ok: false, message: 'Informe valores válidos para IGP-M, IPCA e INCC' })
    }

    if (validarLimites([igpmValue, ipcaValue, inccValue, inccAcumuladoValue])) {
      return res.status(400).json({ ok: false, message: 'Os percentuais informados estão fora do limite permitido' })
    }

    try {
      const [igpmType, ipcaType, inccType] = await Promise.all([
        garantirTipoPadrao(tenant_id, 'IGPM', 'IGP-M', 'FGV'),
        garantirTipoPadrao(tenant_id, 'IPCA', 'IPCA', null),
        garantirTipoPadrao(tenant_id, 'INCC', 'INCC', 'FGV'),
      ])

      await Promise.all([
        salvarValor({
          tenantId: tenant_id,
          userId: user_id,
          typeId: igpmType.id,
          referencia,
          variacaoMensal: igpmValue,
          variacaoPeriodo: null,
          acumulado12m: null,
        }),
        salvarValor({
          tenantId: tenant_id,
          userId: user_id,
          typeId: ipcaType.id,
          referencia,
          variacaoMensal: ipcaValue,
          variacaoPeriodo: null,
          acumulado12m: null,
        }),
        salvarValor({
          tenantId: tenant_id,
          userId: user_id,
          typeId: inccType.id,
          referencia,
          variacaoMensal: inccValue,
          variacaoPeriodo: null,
          acumulado12m: inccAcumuladoValue,
        }),
      ])

      return res.json({ ok: true, message: 'Índices econômicos atualizados com sucesso' })
    } catch (err) {
      if (err.code === '42P01' || err.code === '42703') return erroEstrutura(res)
      throw err
    }
  }
)

module.exports = router
