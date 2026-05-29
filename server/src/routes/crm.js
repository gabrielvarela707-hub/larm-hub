/**
 * server/src/routes/crm.js
 * CRM/Funil — v0.1.5: listas inteligentes, ações em massa e fila de ações manuais.
 */

const express = require('express')
const Joi = require('joi')
const { query, transaction } = require('../config/database')
const { authenticate } = require('../middleware/authenticate')
const { logAudit } = require('../services/auditService')

const router = express.Router()
router.use(authenticate)

const ADMIN_ROLES = new Set(['super_admin', 'admin', 'manager'])

function isManager(user) {
  return ADMIN_ROLES.has(user?.role)
}

async function hasCrmWrite(user) {
  if (isManager(user)) return true
  const { rows } = await query(
    `SELECT 1
       FROM hub_user_profiles up
       JOIN hub_profiles p ON p.id = up.profile_id
      WHERE up.user_id = $1
        AND p.tenant_id = $2
        AND COALESCE((p.permissions->'crm'->>'write')::boolean, false) = true
      LIMIT 1`,
    [user.id, user.tenant_id]
  ).catch(() => ({ rows: [] }))
  return rows.length > 0
}

async function requireCrmWrite(req, res) {
  const ok = await hasCrmWrite(req.user)
  if (!ok) {
    res.status(403).json({ ok: false, message: 'Sem permissão de escrita no CRM' })
    return false
  }
  return true
}

function mapStage(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    color: row.color,
    position: row.position,
    max_days: row.max_days,
    default_responsible_id: row.default_responsible_id,
    is_won: row.is_won,
    is_lost: row.is_lost,
    is_active: row.is_active,
    lead_count: Number(row.lead_count || 0),
    total_value: Number(row.total_value || 0),
  }
}

function mapLead(row) {
  return {
    id: row.id,
    stage_id: row.stage_id,
    stage_code: row.stage_code,
    stage_name: row.stage_name,
    stage_color: row.stage_color,
    responsible_id: row.responsible_id,
    responsible_name: row.responsible_name,
    loss_reason_id: row.loss_reason_id,
    loss_reason_name: row.loss_reason_name,
    name: row.name,
    phone: row.phone || '',
    email: row.email || '',
    source: row.source || 'outros',
    campaign: row.campaign || '',
    empreendimento: row.empreendimento || '',
    estimated_value: Number(row.estimated_value || 0),
    temperature: row.temperature || 'morno',
    score: Number(row.score || 0),
    notes: row.notes || '',
    email_opt_out: Boolean(row.email_opt_out),
    sms_opt_out: Boolean(row.sms_opt_out),
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_interaction_at: row.last_interaction_at,
    next_follow_up_at: row.next_follow_up_at,
    days_in_stage: Number(row.days_in_stage || 0),
    open_tasks_count: Number(row.open_tasks_count || 0),
    overdue_tasks_count: Number(row.overdue_tasks_count || 0),
    next_task_due_at: row.next_task_due_at || null,
  }
}

function mapHistory(row) {
  return {
    id: row.id,
    action: row.action,
    user_id: row.user_id,
    user_name: row.user_name,
    from_stage_id: row.from_stage_id,
    from_stage_name: row.from_stage_name,
    to_stage_id: row.to_stage_id,
    to_stage_name: row.to_stage_name,
    note: row.note || '',
    metadata: row.metadata || {},
    created_at: row.created_at,
  }
}

function mapTask(row) {
  return {
    id: row.id,
    lead_id: row.lead_id,
    lead_name: row.lead_name,
    title: row.title,
    description: row.description || '',
    due_at: row.due_at || null,
    priority: row.priority || 'media',
    status: row.status || 'pendente',
    responsible_id: row.responsible_id || null,
    responsible_name: row.responsible_name || '',
    completed_at: row.completed_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

const stageSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  code: Joi.string().trim().max(80).optional().allow('', null),
  color: Joi.string().trim().max(30).default('#2563EB'),
  position: Joi.number().integer().min(0).default(0),
  max_days: Joi.number().integer().min(0).max(365).default(3),
  default_responsible_id: Joi.string().uuid().optional().allow(null, ''),
  is_won: Joi.boolean().default(false),
  is_lost: Joi.boolean().default(false),
  is_active: Joi.boolean().default(true),
})

const leadSchema = Joi.object({
  stage_id: Joi.string().uuid().optional().allow(null, ''),
  responsible_id: Joi.string().uuid().optional().allow(null, ''),
  loss_reason_id: Joi.string().uuid().optional().allow(null, ''),
  name: Joi.string().trim().min(2).max(160).required(),
  phone: Joi.string().trim().max(40).optional().allow('', null),
  email: Joi.string().trim().email().optional().allow('', null),
  source: Joi.string().trim().max(80).optional().allow('', null),
  campaign: Joi.string().trim().max(160).optional().allow('', null),
  empreendimento: Joi.string().trim().max(160).optional().allow('', null),
  estimated_value: Joi.number().precision(2).min(0).optional().allow(null),
  temperature: Joi.string().valid('frio', 'morno', 'quente').default('morno'),
  score: Joi.number().integer().min(0).max(100).default(0),
  notes: Joi.string().trim().max(5000).optional().allow('', null),
  next_follow_up_at: Joi.date().iso().optional().allow(null, ''),
  history_note: Joi.string().trim().max(2000).optional().allow('', null),
})

const taskSchema = Joi.object({
  lead_id: Joi.string().uuid().required(),
  title: Joi.string().trim().min(2).max(180).required(),
  description: Joi.string().trim().max(2000).optional().allow('', null),
  due_at: Joi.date().iso().optional().allow(null, ''),
  priority: Joi.string().valid('baixa', 'media', 'alta', 'urgente').default('media'),
  status: Joi.string().valid('pendente', 'concluida', 'cancelada').default('pendente'),
  responsible_id: Joi.string().uuid().optional().allow(null, ''),
})

function slugCode(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 70) || `etapa_${Date.now()}`
}


function restrictedToOwnLeads(user) {
  return ['broker', 'consultant', 'assistant'].includes(user?.role)
}

function addLeadVisibility(where, params, user, leadAlias = 'l') {
  if (restrictedToOwnLeads(user)) {
    params.push(user.id)
    where.push(`(${leadAlias}.responsible_id = $${params.length} OR ${leadAlias}.responsible_id IS NULL)`)
  }
}

function normalizeMetricRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (value === null || value === undefined) return [key, value]
    if (['id', 'name', 'email', 'role', 'source', 'campaign', 'stage_name', 'responsible_name', 'loss_reason_name', 'temperature'].includes(key)) return [key, value]
    if (typeof value === 'number') return [key, value]
    if (typeof value === 'string' && value.trim() !== '' && /^-?\d+(\.\d+)?$/.test(value)) return [key, Number(value)]
    return [key, value]
  }))
}

function analyticsBaseCte(whereSql) {
  return `WITH visible_leads AS (
    SELECT l.*,
           s.name AS stage_name,
           s.position AS stage_position,
           s.max_days,
           COALESCE(s.is_won,false) AS is_won,
           COALESCE(s.is_lost,false) AS is_lost,
           u.name AS responsible_name,
           lr.name AS loss_reason_name,
           COALESCE(t.open_tasks,0) AS open_tasks,
           COALESCE(t.overdue_tasks,0) AS overdue_tasks,
           COALESCE(t.completed_tasks,0) AS completed_tasks,
           GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE(l.updated_at, l.created_at))) / 86400))::int AS days_in_stage
      FROM crm_leads l
      LEFT JOIN crm_funnel_stages s ON s.id = l.stage_id
      LEFT JOIN hub_users u ON u.id = l.responsible_id
      LEFT JOIN crm_loss_reasons lr ON lr.id = l.loss_reason_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE task.status='pendente')::int AS open_tasks,
               COUNT(*) FILTER (WHERE task.status='pendente' AND task.due_at IS NOT NULL AND task.due_at < NOW())::int AS overdue_tasks,
               COUNT(*) FILTER (WHERE task.status='concluida')::int AS completed_tasks
          FROM crm_lead_tasks task
         WHERE task.lead_id = l.id
           AND task.tenant_id = l.tenant_id
      ) t ON TRUE
     WHERE ${whereSql}
  )`
}

function weightedForecastExpression() {
  return `COALESCE(SUM(
    CASE WHEN COALESCE(is_won,false)=false AND COALESCE(is_lost,false)=false THEN
      COALESCE(estimated_value,0) *
      CASE
        WHEN COALESCE(score,0) >= 85 THEN 0.80
        WHEN COALESCE(score,0) >= 70 THEN 0.60
        WHEN COALESCE(score,0) >= 50 THEN 0.40
        ELSE 0.15
      END
    ELSE 0 END
  ),0)::numeric`
}

async function runAnalyticsQuery(baseCte, selectSql, params) {
  const { rows } = await query(`${baseCte} ${selectSql}`, params)
  return rows.map(normalizeMetricRow)
}

// ── GET /crm/stages ──────────────────────────────────────────────────────────
router.get('/stages', async (req, res) => {
  const { tenant_id } = req.user
  const { rows } = await query(
    `SELECT s.*,
            COUNT(l.id)::int AS lead_count,
            COALESCE(SUM(l.estimated_value),0)::numeric AS total_value
       FROM crm_funnel_stages s
       LEFT JOIN crm_leads l ON l.stage_id = s.id AND l.is_active = true
      WHERE s.tenant_id = $1
      GROUP BY s.id
      ORDER BY s.position ASC, s.created_at ASC`,
    [tenant_id]
  )
  return res.json({ ok: true, data: rows.map(mapStage) })
})

// ── POST /crm/stages ─────────────────────────────────────────────────────────
router.post('/stages', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  const { error, value } = stageSchema.validate(req.body)
  if (error) return res.status(400).json({ ok: false, message: error.details[0].message })

  const code = value.code?.trim() || slugCode(value.name)
  const { rows: [stage] } = await query(
    `INSERT INTO crm_funnel_stages
       (tenant_id, code, name, color, position, max_days, default_responsible_id, is_won, is_lost, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (tenant_id, code) DO UPDATE SET
       name=EXCLUDED.name,
       color=EXCLUDED.color,
       position=EXCLUDED.position,
       max_days=EXCLUDED.max_days,
       default_responsible_id=EXCLUDED.default_responsible_id,
       is_won=EXCLUDED.is_won,
       is_lost=EXCLUDED.is_lost,
       is_active=EXCLUDED.is_active,
       updated_at=NOW()
     RETURNING *`,
    [req.user.tenant_id, code, value.name, value.color, value.position, value.max_days, value.default_responsible_id || null, value.is_won, value.is_lost, value.is_active]
  )
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'crm_stage_save', module: 'crm', entityType: 'crm_funnel_stages', entityId: stage.id, meta: { name: stage.name, code: stage.code } }).catch(() => {})
  return res.status(201).json({ ok: true, data: mapStage(stage) })
})

// ── PUT /crm/stages/:id ──────────────────────────────────────────────────────
router.put('/stages/:id', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  const { error, value } = stageSchema.validate(req.body)
  if (error) return res.status(400).json({ ok: false, message: error.details[0].message })

  const { rows } = await query(
    `UPDATE crm_funnel_stages
        SET name=$1, color=$2, position=$3, max_days=$4,
            default_responsible_id=$5, is_won=$6, is_lost=$7, is_active=$8, updated_at=NOW()
      WHERE id=$9 AND tenant_id=$10
      RETURNING *`,
    [value.name, value.color, value.position, value.max_days, value.default_responsible_id || null, value.is_won, value.is_lost, value.is_active, req.params.id, req.user.tenant_id]
  )
  if (!rows.length) return res.status(404).json({ ok: false, message: 'Etapa não encontrada' })
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'crm_stage_update', module: 'crm', entityType: 'crm_funnel_stages', entityId: req.params.id, meta: { name: value.name } }).catch(() => {})
  return res.json({ ok: true, data: mapStage(rows[0]) })
})

// ── DELETE /crm/stages/:id ───────────────────────────────────────────────────
router.delete('/stages/:id', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  await query(
    `UPDATE crm_funnel_stages SET is_active=false, updated_at=NOW()
      WHERE id=$1 AND tenant_id=$2`,
    [req.params.id, req.user.tenant_id]
  )
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'crm_stage_inactivate', module: 'crm', entityType: 'crm_funnel_stages', entityId: req.params.id }).catch(() => {})
  return res.json({ ok: true })
})

// ── GET /crm/loss-reasons ────────────────────────────────────────────────────
router.get('/loss-reasons', async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM crm_loss_reasons WHERE tenant_id=$1 ORDER BY position ASC, name ASC`,
    [req.user.tenant_id]
  )
  return res.json({ ok: true, data: rows })
})

router.post('/loss-reasons', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  const name = String(req.body.name || '').trim()
  if (!name) return res.status(400).json({ ok: false, message: 'Nome obrigatório' })
  const position = Number(req.body.position || 0)
  const { rows: [reason] } = await query(
    `INSERT INTO crm_loss_reasons (tenant_id, name, position, is_active)
     VALUES ($1,$2,$3,true)
     ON CONFLICT (tenant_id, name) DO UPDATE SET position=EXCLUDED.position, is_active=true, updated_at=NOW()
     RETURNING *`,
    [req.user.tenant_id, name, position]
  )
  return res.status(201).json({ ok: true, data: reason })
})

router.put('/loss-reasons/:id', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  const name = String(req.body.name || '').trim()
  if (!name) return res.status(400).json({ ok: false, message: 'Nome obrigatório' })
  const position = Number(req.body.position || 0)
  const isActive = req.body.is_active !== false
  const { rows } = await query(
    `UPDATE crm_loss_reasons SET name=$1, position=$2, is_active=$3, updated_at=NOW()
      WHERE id=$4 AND tenant_id=$5 RETURNING *`,
    [name, position, isActive, req.params.id, req.user.tenant_id]
  )
  if (!rows.length) return res.status(404).json({ ok: false, message: 'Motivo não encontrado' })
  return res.json({ ok: true, data: rows[0] })
})

router.delete('/loss-reasons/:id', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  await query(
    `UPDATE crm_loss_reasons SET is_active=false, updated_at=NOW()
      WHERE id=$1 AND tenant_id=$2`,
    [req.params.id, req.user.tenant_id]
  )
  return res.json({ ok: true })
})

// ── GET /crm/users ───────────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  const { rows } = await query(
    `SELECT id, name, email, role
       FROM hub_users
      WHERE tenant_id=$1 AND is_active=true
      ORDER BY name ASC`,
    [req.user.tenant_id]
  )
  return res.json({ ok: true, data: rows })
})


// ── GET /crm/summary ────────────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  const { tenant_id } = req.user
  const params = [tenant_id]
  const leadWhere = ['l.tenant_id = $1', 'l.is_active = true']
  addLeadVisibility(leadWhere, params, req.user)
  const leadWhereSql = leadWhere.join(' AND ')

  const { rows: [summary] } = await query(
    `WITH visible_leads AS (
       SELECT l.*, s.max_days, s.is_won, s.is_lost
         FROM crm_leads l
         LEFT JOIN crm_funnel_stages s ON s.id = l.stage_id
        WHERE ${leadWhereSql}
     ), visible_tasks AS (
       SELECT t.*, l.name AS lead_name
         FROM crm_lead_tasks t
         JOIN visible_leads l ON l.id = t.lead_id
        WHERE t.tenant_id = $1
     )
     SELECT
       (SELECT COUNT(*)::int FROM visible_tasks WHERE status='pendente' AND due_at >= date_trunc('day', NOW()) AND due_at < date_trunc('day', NOW()) + INTERVAL '1 day') AS tasks_today,
       (SELECT COUNT(*)::int FROM visible_tasks WHERE status='pendente' AND due_at IS NOT NULL AND due_at < NOW()) AS tasks_overdue,
       (SELECT COUNT(*)::int FROM visible_tasks WHERE status='pendente' AND due_at >= NOW() AND due_at <= NOW() + INTERVAL '48 hours') AS tasks_due_soon,
       (SELECT COUNT(*)::int FROM visible_leads WHERE COALESCE(is_won,false)=false AND COALESCE(is_lost,false)=false AND (last_interaction_at IS NULL OR last_interaction_at < NOW() - INTERVAL '7 days')) AS leads_without_contact,
       (SELECT COUNT(*)::int FROM visible_leads WHERE COALESCE(max_days,0) > 0 AND GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE(updated_at, created_at))) / 86400)) > max_days) AS sla_overdue`,
    params
  )

  const taskParams = [tenant_id]
  const taskLeadWhere = ['l.tenant_id = $1', 'l.is_active = true']
  addLeadVisibility(taskLeadWhere, taskParams, req.user)
  const { rows: tasks } = await query(
    `SELECT t.*, l.name AS lead_name, u.name AS responsible_name
       FROM crm_lead_tasks t
       JOIN crm_leads l ON l.id = t.lead_id
       LEFT JOIN hub_users u ON u.id = t.responsible_id
      WHERE t.tenant_id = $1
        AND t.status = 'pendente'
        AND ${taskLeadWhere.join(' AND ')}
      ORDER BY
        CASE WHEN t.due_at IS NOT NULL AND t.due_at < NOW() THEN 0 ELSE 1 END,
        t.due_at ASC NULLS LAST,
        CASE t.priority WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
        t.created_at DESC
      LIMIT 12`,
    taskParams
  )

  return res.json({ ok: true, data: { ...summary, tasks: tasks.map(mapTask) } })
})

// ── GET /crm/analytics ──────────────────────────────────────────────────────
router.get('/analytics', async (req, res) => {
  const params = [req.user.tenant_id]
  const where = ['l.tenant_id = $1', 'l.is_active = true']
  if (req.query.date_from) { params.push(req.query.date_from); where.push(`l.created_at >= $${params.length}`) }
  if (req.query.date_to) { params.push(req.query.date_to); where.push(`l.created_at <= $${params.length}`) }
  addLeadVisibility(where, params, req.user, 'l')
  const baseCte = analyticsBaseCte(where.join(' AND '))
  const forecastExpr = weightedForecastExpression()

  const [[totals], byStage, bySource, byResponsible, byCampaign, lossReasons, scoreBuckets] = await Promise.all([
    runAnalyticsQuery(baseCte, `
      SELECT COUNT(*)::int AS total_leads,
             COUNT(*) FILTER (WHERE is_won)::int AS won_leads,
             COUNT(*) FILTER (WHERE is_lost)::int AS lost_leads,
             COUNT(*) FILTER (WHERE is_won=false AND is_lost=false)::int AS active_pipeline,
             COUNT(*) FILTER (WHERE COALESCE(score,0) >= 80 AND is_won=false AND is_lost=false)::int AS hot_leads,
             COUNT(*) FILTER (WHERE COALESCE(score,0) >= 50 AND COALESCE(score,0) < 80 AND is_won=false AND is_lost=false)::int AS warm_leads,
             COUNT(*) FILTER (WHERE COALESCE(score,0) < 50 AND is_won=false AND is_lost=false)::int AS cold_leads,
             COALESCE(SUM(estimated_value) FILTER (WHERE is_won),0)::numeric AS won_value,
             COALESCE(SUM(estimated_value) FILTER (WHERE is_won=false AND is_lost=false),0)::numeric AS pipeline_value,
             ${forecastExpr} AS weighted_forecast,
             COALESCE(ROUND(AVG(score)::numeric,1),0)::numeric AS avg_score,
             COALESCE(ROUND((COUNT(*) FILTER (WHERE is_won)::numeric / NULLIF(COUNT(*),0)) * 100,1),0)::numeric AS conversion_rate,
             COALESCE(ROUND((COUNT(*) FILTER (WHERE is_lost)::numeric / NULLIF(COUNT(*),0)) * 100,1),0)::numeric AS loss_rate,
             COUNT(*) FILTER (WHERE overdue_tasks > 0)::int AS leads_with_overdue_tasks,
             COUNT(*) FILTER (WHERE max_days > 0 AND days_in_stage > max_days AND is_won=false AND is_lost=false)::int AS sla_overdue
        FROM visible_leads`, params),
    runAnalyticsQuery(baseCte, `
      SELECT COALESCE(stage_name,'Sem etapa') AS stage_name,
             COALESCE(MIN(stage_position),999)::int AS position,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE is_won)::int AS won,
             COUNT(*) FILTER (WHERE is_lost)::int AS lost,
             COALESCE(SUM(estimated_value),0)::numeric AS total_value,
             COALESCE(SUM(estimated_value) FILTER (WHERE is_won=false AND is_lost=false),0)::numeric AS pipeline_value,
             COALESCE(ROUND(AVG(score)::numeric,1),0)::numeric AS avg_score,
             COUNT(*) FILTER (WHERE max_days > 0 AND days_in_stage > max_days AND is_won=false AND is_lost=false)::int AS sla_overdue,
             COALESCE(ROUND((COUNT(*) FILTER (WHERE is_won)::numeric / NULLIF(COUNT(*),0)) * 100,1),0)::numeric AS conversion_rate
        FROM visible_leads
       GROUP BY COALESCE(stage_name,'Sem etapa')
       ORDER BY position ASC, total DESC`, params),
    runAnalyticsQuery(baseCte, `
      SELECT COALESCE(source,'outros') AS source,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE is_won)::int AS won,
             COUNT(*) FILTER (WHERE is_lost)::int AS lost,
             COALESCE(SUM(estimated_value) FILTER (WHERE is_won),0)::numeric AS won_value,
             COALESCE(SUM(estimated_value) FILTER (WHERE is_won=false AND is_lost=false),0)::numeric AS pipeline_value,
             ${forecastExpr} AS weighted_forecast,
             COALESCE(ROUND(AVG(score)::numeric,1),0)::numeric AS avg_score,
             COALESCE(ROUND((COUNT(*) FILTER (WHERE is_won)::numeric / NULLIF(COUNT(*),0)) * 100,1),0)::numeric AS conversion_rate
        FROM visible_leads
       GROUP BY COALESCE(source,'outros')
       ORDER BY total DESC, won_value DESC`, params),
    runAnalyticsQuery(baseCte, `
      SELECT COALESCE(responsible_id::text,'') AS responsible_id,
             COALESCE(responsible_name,'Sem responsável') AS responsible_name,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE is_won)::int AS won,
             COUNT(*) FILTER (WHERE is_lost)::int AS lost,
             COUNT(*) FILTER (WHERE is_won=false AND is_lost=false)::int AS active_pipeline,
             COALESCE(SUM(estimated_value) FILTER (WHERE is_won),0)::numeric AS won_value,
             COALESCE(SUM(estimated_value) FILTER (WHERE is_won=false AND is_lost=false),0)::numeric AS pipeline_value,
             ${forecastExpr} AS weighted_forecast,
             COALESCE(ROUND(AVG(score)::numeric,1),0)::numeric AS avg_score,
             COUNT(*) FILTER (WHERE overdue_tasks > 0)::int AS overdue_tasks,
             COALESCE(ROUND((COUNT(*) FILTER (WHERE is_won)::numeric / NULLIF(COUNT(*),0)) * 100,1),0)::numeric AS conversion_rate
        FROM visible_leads
       GROUP BY COALESCE(responsible_id::text,''), COALESCE(responsible_name,'Sem responsável')
       ORDER BY won DESC, conversion_rate DESC, pipeline_value DESC`, params),
    runAnalyticsQuery(baseCte, `
      SELECT COALESCE(NULLIF(campaign,''),'Sem campanha') AS campaign,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE is_won)::int AS won,
             COUNT(*) FILTER (WHERE is_lost)::int AS lost,
             COALESCE(SUM(estimated_value) FILTER (WHERE is_won),0)::numeric AS won_value,
             COALESCE(SUM(estimated_value) FILTER (WHERE is_won=false AND is_lost=false),0)::numeric AS pipeline_value,
             ${forecastExpr} AS weighted_forecast,
             COALESCE(ROUND(AVG(score)::numeric,1),0)::numeric AS avg_score,
             COALESCE(ROUND((COUNT(*) FILTER (WHERE is_won)::numeric / NULLIF(COUNT(*),0)) * 100,1),0)::numeric AS conversion_rate
        FROM visible_leads
       GROUP BY COALESCE(NULLIF(campaign,''),'Sem campanha')
       ORDER BY total DESC, weighted_forecast DESC
       LIMIT 30`, params),
    runAnalyticsQuery(baseCte, `
      SELECT COALESCE(loss_reason_name,'Sem motivo') AS loss_reason_name,
             COUNT(*)::int AS total,
             COALESCE(SUM(estimated_value),0)::numeric AS lost_value
        FROM visible_leads
       WHERE is_lost = true
       GROUP BY COALESCE(loss_reason_name,'Sem motivo')
       ORDER BY total DESC, lost_value DESC`, params),
    runAnalyticsQuery(baseCte, `
      SELECT temperature,
             COUNT(*)::int AS total,
             COALESCE(SUM(pipeline_value),0)::numeric AS pipeline_value,
             COALESCE(SUM(weighted_value),0)::numeric AS weighted_forecast,
             COALESCE(ROUND(AVG(score)::numeric,1),0)::numeric AS avg_score
        FROM (
          SELECT CASE
                   WHEN COALESCE(score,0) >= 80 THEN 'quente'
                   WHEN COALESCE(score,0) >= 50 THEN 'morno'
                   ELSE 'frio'
                 END AS temperature,
                 score,
                 CASE WHEN is_won=false AND is_lost=false THEN COALESCE(estimated_value,0) ELSE 0 END AS pipeline_value,
                 CASE WHEN is_won=false AND is_lost=false THEN
                   COALESCE(estimated_value,0) *
                   CASE
                     WHEN COALESCE(score,0) >= 85 THEN 0.80
                     WHEN COALESCE(score,0) >= 70 THEN 0.60
                     WHEN COALESCE(score,0) >= 50 THEN 0.40
                     ELSE 0.15
                   END
                 ELSE 0 END AS weighted_value
            FROM visible_leads
        ) bucketed
       GROUP BY temperature
       ORDER BY CASE temperature WHEN 'quente' THEN 0 WHEN 'morno' THEN 1 ELSE 2 END`, params),

  ])

  return res.json({
    ok: true,
    data: {
      totals: totals || {},
      by_stage: byStage,
      by_source: bySource,
      by_responsible: byResponsible,
      by_campaign: byCampaign,
      loss_reasons: lossReasons,
      score_buckets: scoreBuckets,
    },
  })
})

// ── POST /crm/leads/recalculate-scores ─────────────────────────────────────
router.post('/leads/recalculate-scores', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  const { rows } = await query(
    `WITH task_stats AS (
       SELECT lead_id,
              COUNT(*) FILTER (WHERE status='pendente')::int AS open_tasks,
              COUNT(*) FILTER (WHERE status='pendente' AND due_at IS NOT NULL AND due_at < NOW())::int AS overdue_tasks,
              COUNT(*) FILTER (WHERE status='concluida')::int AS completed_tasks
         FROM crm_lead_tasks
        WHERE tenant_id = $1
        GROUP BY lead_id
     ), computed AS (
       SELECT l.id,
              CASE
                WHEN COALESCE(s.is_won,false) THEN 100
                WHEN COALESCE(s.is_lost,false) THEN 0
                ELSE LEAST(100, GREATEST(0,
                  15
                  + CASE WHEN NULLIF(regexp_replace(COALESCE(l.phone,''),'\\D','','g'),'') IS NOT NULL THEN 15 ELSE 0 END
                  + CASE WHEN NULLIF(l.email,'') IS NOT NULL THEN 10 ELSE 0 END
                  + CASE WHEN NULLIF(l.empreendimento,'') IS NOT NULL THEN 10 ELSE 0 END
                  + CASE WHEN NULLIF(l.campaign,'') IS NOT NULL THEN 5 ELSE 0 END
                  + CASE WHEN COALESCE(l.estimated_value,0) > 0 THEN 10 ELSE 0 END
                  + CASE WHEN l.source IN ('indicacao','whatsapp') THEN 15 WHEN l.source IN ('meta_ads','google_ads') THEN 12 WHEN l.source IN ('instagram','facebook','site','portal') THEN 8 ELSE 0 END
                  + CASE WHEN l.next_follow_up_at IS NOT NULL AND l.next_follow_up_at >= NOW() THEN 10 ELSE 0 END
                  + CASE WHEN COALESCE(ts.open_tasks,0) > 0 THEN 5 ELSE 0 END
                  + CASE WHEN COALESCE(ts.completed_tasks,0) > 0 THEN 10 ELSE 0 END
                  + CASE WHEN l.last_interaction_at IS NOT NULL AND l.last_interaction_at >= NOW() - INTERVAL '7 days' THEN 10 ELSE 0 END
                  - CASE WHEN COALESCE(ts.overdue_tasks,0) > 0 THEN 20 ELSE 0 END
                  - CASE WHEN l.last_interaction_at IS NULL OR l.last_interaction_at < NOW() - INTERVAL '14 days' THEN 15 ELSE 0 END
                ))::int
              END AS new_score
         FROM crm_leads l
         LEFT JOIN crm_funnel_stages s ON s.id = l.stage_id
         LEFT JOIN task_stats ts ON ts.lead_id = l.id
        WHERE l.tenant_id = $1
          AND l.is_active = true
     )
     UPDATE crm_leads l
        SET score = c.new_score,
            temperature = CASE WHEN c.new_score >= 80 THEN 'quente' WHEN c.new_score >= 50 THEN 'morno' ELSE 'frio' END,
            updated_at = NOW()
       FROM computed c
      WHERE l.id = c.id
      RETURNING l.id`,
    [req.user.tenant_id]
  )
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'crm_score_recalculate', module: 'crm', entityType: 'crm_leads', meta: { updated: rows.length } }).catch(() => {})
  return res.json({ ok: true, data: { updated: rows.length } })
})


// ── GET /crm/tasks ──────────────────────────────────────────────────────────
router.get('/tasks', async (req, res) => {
  const params = [req.user.tenant_id]
  const where = ['t.tenant_id = $1', 'l.is_active = true']

  if (req.query.lead_id) { params.push(req.query.lead_id); where.push(`t.lead_id = $${params.length}`) }
  if (req.query.status && req.query.status !== 'all') { params.push(req.query.status); where.push(`t.status = $${params.length}`) }
  if (req.query.priority && req.query.priority !== 'all') { params.push(req.query.priority); where.push(`t.priority = $${params.length}`) }
  if (req.query.responsible_id && req.query.responsible_id !== 'all') { params.push(req.query.responsible_id); where.push(`t.responsible_id = $${params.length}`) }
  if (req.query.scope === 'mine') { params.push(req.user.id); where.push(`(t.responsible_id = $${params.length} OR (t.responsible_id IS NULL AND l.responsible_id = $${params.length}))`) }
  if (req.query.overdue === 'true') where.push(`t.status='pendente' AND t.due_at IS NOT NULL AND t.due_at < NOW()`)
  if (req.query.date_from) { params.push(req.query.date_from); where.push(`t.due_at >= $${params.length}`) }
  if (req.query.date_to) { params.push(req.query.date_to); where.push(`t.due_at <= $${params.length}`) }
  addLeadVisibility(where, params, req.user)

  const { rows } = await query(
    `SELECT t.*, l.name AS lead_name, u.name AS responsible_name
       FROM crm_lead_tasks t
       JOIN crm_leads l ON l.id = t.lead_id
       LEFT JOIN hub_users u ON u.id = t.responsible_id
      WHERE ${where.join(' AND ')}
      ORDER BY
        CASE WHEN t.status='pendente' AND t.due_at IS NOT NULL AND t.due_at < NOW() THEN 0 ELSE 1 END,
        t.due_at ASC NULLS LAST,
        CASE t.priority WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
        t.created_at DESC
      LIMIT 300`,
    params
  )
  return res.json({ ok: true, data: rows.map(mapTask) })
})

// ── POST /crm/tasks ─────────────────────────────────────────────────────────
router.post('/tasks', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  const { error, value } = taskSchema.validate(req.body)
  if (error) return res.status(400).json({ ok: false, message: error.details[0].message })

  const { rows: leadRows } = await query(
    `SELECT id, name, responsible_id FROM crm_leads WHERE id=$1 AND tenant_id=$2 AND is_active=true`,
    [value.lead_id, req.user.tenant_id]
  )
  if (!leadRows.length) return res.status(404).json({ ok: false, message: 'Lead não encontrado' })

  const responsibleId = value.responsible_id || leadRows[0].responsible_id || req.user.id
  const { rows: [task] } = await query(
    `INSERT INTO crm_lead_tasks
       (tenant_id, lead_id, title, description, due_at, priority, status, responsible_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [req.user.tenant_id, value.lead_id, value.title, value.description || '', value.due_at || null, value.priority, value.status, responsibleId, req.user.id]
  )

  await query(
    `UPDATE crm_leads SET next_follow_up_at = COALESCE($1, next_follow_up_at), updated_at=NOW() WHERE id=$2 AND tenant_id=$3`,
    [value.due_at || null, value.lead_id, req.user.tenant_id]
  )
  await query(
    `INSERT INTO crm_lead_history (tenant_id, lead_id, user_id, action, note, metadata)
     VALUES ($1,$2,$3,'task_created',$4,$5)`,
    [req.user.tenant_id, value.lead_id, req.user.id, `Tarefa criada: ${value.title}`, JSON.stringify({ task_id: task.id, due_at: value.due_at || null, priority: value.priority })]
  )
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'crm_task_create', module: 'crm', entityType: 'crm_lead_tasks', entityId: task.id, meta: { lead_id: value.lead_id, title: value.title } }).catch(() => {})
  return res.status(201).json({ ok: true, data: mapTask({ ...task, lead_name: leadRows[0].name }) })
})

// ── PUT /crm/tasks/:id ──────────────────────────────────────────────────────
router.put('/tasks/:id', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  const { error, value } = taskSchema.validate(req.body)
  if (error) return res.status(400).json({ ok: false, message: error.details[0].message })

  const { rows } = await query(
    `UPDATE crm_lead_tasks SET
        lead_id=$1,
        title=$2,
        description=$3,
        due_at=$4,
        priority=$5,
        status=$6,
        responsible_id=$7,
        updated_at=NOW()
      WHERE id=$8 AND tenant_id=$9
      RETURNING *`,
    [value.lead_id, value.title, value.description || '', value.due_at || null, value.priority, value.status, value.responsible_id || null, req.params.id, req.user.tenant_id]
  )
  if (!rows.length) return res.status(404).json({ ok: false, message: 'Tarefa não encontrada' })
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'crm_task_update', module: 'crm', entityType: 'crm_lead_tasks', entityId: req.params.id, meta: { title: value.title } }).catch(() => {})
  return res.json({ ok: true, data: mapTask(rows[0]) })
})

// ── PATCH /crm/tasks/:id/complete ───────────────────────────────────────────
router.patch('/tasks/:id/complete', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  const { rows } = await query(
    `UPDATE crm_lead_tasks
        SET status='concluida', completed_at=NOW(), completed_by=$1, updated_at=NOW()
      WHERE id=$2 AND tenant_id=$3
      RETURNING *`,
    [req.user.id, req.params.id, req.user.tenant_id]
  )
  if (!rows.length) return res.status(404).json({ ok: false, message: 'Tarefa não encontrada' })
  const task = rows[0]
  await query(`UPDATE crm_leads SET last_interaction_at=NOW(), updated_at=NOW() WHERE id=$1 AND tenant_id=$2`, [task.lead_id, req.user.tenant_id])
  await query(
    `INSERT INTO crm_lead_history (tenant_id, lead_id, user_id, action, note, metadata)
     VALUES ($1,$2,$3,'task_completed',$4,$5)`,
    [req.user.tenant_id, task.lead_id, req.user.id, `Tarefa concluída: ${task.title}`, JSON.stringify({ task_id: task.id })]
  )
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'crm_task_complete', module: 'crm', entityType: 'crm_lead_tasks', entityId: task.id }).catch(() => {})
  return res.json({ ok: true, data: mapTask(task) })
})

// ── DELETE /crm/tasks/:id ───────────────────────────────────────────────────
router.delete('/tasks/:id', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  const { rows } = await query(
    `UPDATE crm_lead_tasks SET status='cancelada', updated_at=NOW()
      WHERE id=$1 AND tenant_id=$2 RETURNING *`,
    [req.params.id, req.user.tenant_id]
  )
  if (!rows.length) return res.status(404).json({ ok: false, message: 'Tarefa não encontrada' })
  await query(
    `INSERT INTO crm_lead_history (tenant_id, lead_id, user_id, action, note, metadata)
     VALUES ($1,$2,$3,'task_canceled',$4,$5)`,
    [req.user.tenant_id, rows[0].lead_id, req.user.id, `Tarefa cancelada: ${rows[0].title}`, JSON.stringify({ task_id: rows[0].id })]
  ).catch(() => {})
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'crm_task_cancel', module: 'crm', entityType: 'crm_lead_tasks', entityId: req.params.id }).catch(() => {})
  return res.json({ ok: true })
})

// ── GET /crm/leads ───────────────────────────────────────────────────────────
router.get('/leads', async (req, res) => {
  const { tenant_id } = req.user
  const params = [tenant_id]
  const where = ['l.tenant_id = $1', 'l.is_active = true']

  if (req.query.stage_id) { params.push(req.query.stage_id); where.push(`l.stage_id = $${params.length}`) }
  if (req.query.responsible_id) { params.push(req.query.responsible_id); where.push(`l.responsible_id = $${params.length}`) }
  if (req.query.source) { params.push(req.query.source); where.push(`l.source = $${params.length}`) }
  if (req.query.temperature) { params.push(req.query.temperature); where.push(`l.temperature = $${params.length}`) }
  if (req.query.q) {
    params.push(`%${String(req.query.q).trim()}%`)
    where.push(`(l.name ILIKE $${params.length} OR l.phone ILIKE $${params.length} OR l.email ILIKE $${params.length} OR l.notes ILIKE $${params.length})`)
  }

  // Corretor/consultor/assistente visualizam apenas leads próprios ou sem responsável.
  addLeadVisibility(where, params, req.user)

  const { rows } = await query(
    `SELECT l.*,
            s.code AS stage_code,
            s.name AS stage_name,
            s.color AS stage_color,
            u.name AS responsible_name,
            r.name AS loss_reason_name,
            COALESCE(ta.open_tasks_count, 0)::int AS open_tasks_count,
            COALESCE(ta.overdue_tasks_count, 0)::int AS overdue_tasks_count,
            ta.next_task_due_at,
            GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE(l.updated_at, l.created_at))) / 86400))::int AS days_in_stage
       FROM crm_leads l
       LEFT JOIN crm_funnel_stages s ON s.id = l.stage_id
       LEFT JOIN hub_users u ON u.id = l.responsible_id
       LEFT JOIN crm_loss_reasons r ON r.id = l.loss_reason_id
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) FILTER (WHERE t.status='pendente') AS open_tasks_count,
           COUNT(*) FILTER (WHERE t.status='pendente' AND t.due_at IS NOT NULL AND t.due_at < NOW()) AS overdue_tasks_count,
           MIN(t.due_at) FILTER (WHERE t.status='pendente' AND t.due_at IS NOT NULL) AS next_task_due_at
         FROM crm_lead_tasks t
         WHERE t.lead_id = l.id AND t.tenant_id = l.tenant_id
       ) ta ON TRUE
      WHERE ${where.join(' AND ')}
      ORDER BY s.position ASC, l.updated_at DESC
      LIMIT 500`,
    params
  )
  return res.json({ ok: true, data: rows.map(mapLead) })
})

// ── POST /crm/leads ──────────────────────────────────────────────────────────
router.post('/leads', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  const { error, value } = leadSchema.validate(req.body)
  if (error) return res.status(400).json({ ok: false, message: error.details[0].message })

  const { rows: defaultStageRows } = await query(
    `SELECT id FROM crm_funnel_stages WHERE tenant_id=$1 AND is_active=true ORDER BY position ASC LIMIT 1`,
    [req.user.tenant_id]
  )
  const stageId = value.stage_id || defaultStageRows[0]?.id || null

  const { rows: [lead] } = await query(
    `INSERT INTO crm_leads
      (tenant_id, stage_id, responsible_id, loss_reason_id, name, phone, email, source, campaign,
       empreendimento, estimated_value, temperature, score, notes, next_follow_up_at, created_by, last_interaction_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
     RETURNING *`,
    [req.user.tenant_id, stageId, value.responsible_id || null, value.loss_reason_id || null, value.name, value.phone || '', value.email || '', value.source || 'outros', value.campaign || '', value.empreendimento || '', value.estimated_value || 0, value.temperature, value.score, value.notes || '', value.next_follow_up_at || null, req.user.id]
  )

  await query(
    `INSERT INTO crm_lead_history (tenant_id, lead_id, user_id, action, to_stage_id, note, metadata)
     VALUES ($1,$2,$3,'created',$4,$5,$6)`,
    [req.user.tenant_id, lead.id, req.user.id, stageId, value.history_note || 'Lead criado', JSON.stringify({ source: value.source || 'outros' })]
  )
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'crm_lead_create', module: 'crm', entityType: 'crm_leads', entityId: lead.id, meta: { name: lead.name } }).catch(() => {})

  return res.status(201).json({ ok: true, data: mapLead(lead) })
})

// ── POST /crm/leads/import ───────────────────────────────────────────────────
router.post('/leads/import', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  const leads = Array.isArray(req.body.leads) ? req.body.leads.slice(0, 500) : []
  if (!leads.length) return res.status(400).json({ ok: false, message: 'Nenhum lead para importar' })

  const { rows: defaultStageRows } = await query(
    `SELECT id FROM crm_funnel_stages WHERE tenant_id=$1 AND is_active=true ORDER BY position ASC LIMIT 1`,
    [req.user.tenant_id]
  )
  const defaultStageId = defaultStageRows[0]?.id || null

  let created = 0
  for (const item of leads) {
    const name = String(item.name || item.nome || '').trim()
    if (!name) continue
    const phone = String(item.phone || item.telefone || '').trim()
    const { rows: existing } = phone
      ? await query(`SELECT id FROM crm_leads WHERE tenant_id=$1 AND regexp_replace(phone,'\\D','','g') = regexp_replace($2,'\\D','','g') LIMIT 1`, [req.user.tenant_id, phone])
      : { rows: [] }
    if (existing.length) continue

    const stageId = item.stage_id || defaultStageId
    const { rows: [lead] } = await query(
      `INSERT INTO crm_leads
        (tenant_id, stage_id, name, phone, email, source, campaign, empreendimento, estimated_value, temperature, score, notes, created_by, last_interaction_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW()) RETURNING id`,
      [req.user.tenant_id, stageId, name, phone, item.email || '', item.source || item.fonte || 'outros', item.campaign || '', item.empreendimento || '', item.estimated_value || 0, item.temperature || 'morno', item.score || 0, item.notes || item.detalhamento || '', req.user.id]
    )
    await query(
      `INSERT INTO crm_lead_history (tenant_id, lead_id, user_id, action, to_stage_id, note)
       VALUES ($1,$2,$3,'imported',$4,'Lead importado do Excel')`,
      [req.user.tenant_id, lead.id, req.user.id, stageId]
    )
    created += 1
  }

  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'crm_leads_import', module: 'crm', entityType: 'crm_leads', meta: { received: leads.length, created } }).catch(() => {})
  return res.json({ ok: true, data: { created, received: leads.length } })
})

// ── PUT /crm/leads/:id ───────────────────────────────────────────────────────
router.put('/leads/:id', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  const { error, value } = leadSchema.validate({ ...req.body, name: req.body.name || 'Lead sem nome' })
  if (error) return res.status(400).json({ ok: false, message: error.details[0].message })

  const leadId = req.params.id
  const result = await transaction(async (client) => {
    const { rows: oldRows } = await client.query(
      `SELECT l.*, s.is_lost FROM crm_leads l LEFT JOIN crm_funnel_stages s ON s.id=l.stage_id
        WHERE l.id=$1 AND l.tenant_id=$2`,
      [leadId, req.user.tenant_id]
    )
    if (!oldRows.length) return null
    const old = oldRows[0]

    let lossReasonId = value.loss_reason_id || null
    if (value.stage_id) {
      const { rows: targetStages } = await client.query(
        `SELECT id, is_lost FROM crm_funnel_stages WHERE id=$1 AND tenant_id=$2`,
        [value.stage_id, req.user.tenant_id]
      )
      if (targetStages[0]?.is_lost && !lossReasonId) {
        throw Object.assign(new Error('Informe o motivo de perda antes de mover para Perdido'), { statusCode: 400 })
      }
      if (!targetStages[0]?.is_lost) lossReasonId = null
    }

    const { rows: updatedRows } = await client.query(
      `UPDATE crm_leads SET
          stage_id=$1,
          responsible_id=$2,
          loss_reason_id=$3,
          name=$4,
          phone=$5,
          email=$6,
          source=$7,
          campaign=$8,
          empreendimento=$9,
          estimated_value=$10,
          temperature=$11,
          score=$12,
          notes=$13,
          next_follow_up_at=$14,
          last_interaction_at=NOW(),
          updated_at=NOW()
        WHERE id=$15 AND tenant_id=$16
        RETURNING *`,
      [value.stage_id || old.stage_id, value.responsible_id || null, lossReasonId, value.name, value.phone || '', value.email || '', value.source || 'outros', value.campaign || '', value.empreendimento || '', value.estimated_value || 0, value.temperature, value.score, value.notes || '', value.next_follow_up_at || null, leadId, req.user.tenant_id]
    )

    const stageChanged = String(old.stage_id || '') !== String(value.stage_id || old.stage_id || '')
    const action = stageChanged ? 'stage_changed' : 'updated'
    await client.query(
      `INSERT INTO crm_lead_history (tenant_id, lead_id, user_id, action, from_stage_id, to_stage_id, note, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [req.user.tenant_id, leadId, req.user.id, action, old.stage_id, value.stage_id || old.stage_id, value.history_note || (stageChanged ? 'Etapa alterada' : 'Lead atualizado'), JSON.stringify({ loss_reason_id: lossReasonId })]
    )
    return updatedRows[0]
  })

  if (!result) return res.status(404).json({ ok: false, message: 'Lead não encontrado' })
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'crm_lead_update', module: 'crm', entityType: 'crm_leads', entityId: leadId, meta: { name: result.name } }).catch(() => {})
  return res.json({ ok: true, data: mapLead(result) })
})

// ── DELETE /crm/leads/:id ────────────────────────────────────────────────────
router.delete('/leads/:id', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  await query(
    `UPDATE crm_leads SET is_active=false, updated_at=NOW() WHERE id=$1 AND tenant_id=$2`,
    [req.params.id, req.user.tenant_id]
  )
  await query(
    `INSERT INTO crm_lead_history (tenant_id, lead_id, user_id, action, note)
     VALUES ($1,$2,$3,'inactivated','Lead inativado')`,
    [req.user.tenant_id, req.params.id, req.user.id]
  ).catch(() => {})
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'crm_lead_inactivate', module: 'crm', entityType: 'crm_leads', entityId: req.params.id }).catch(() => {})
  return res.json({ ok: true })
})

// ── GET /crm/leads/:id/history ───────────────────────────────────────────────
router.get('/leads/:id/history', async (req, res) => {
  const { rows } = await query(
    `SELECT h.*,
            u.name AS user_name,
            fs.name AS from_stage_name,
            ts.name AS to_stage_name
       FROM crm_lead_history h
       LEFT JOIN hub_users u ON u.id = h.user_id
       LEFT JOIN crm_funnel_stages fs ON fs.id = h.from_stage_id
       LEFT JOIN crm_funnel_stages ts ON ts.id = h.to_stage_id
      WHERE h.tenant_id=$1 AND h.lead_id=$2
      ORDER BY h.created_at DESC
      LIMIT 100`,
    [req.user.tenant_id, req.params.id]
  )
  return res.json({ ok: true, data: rows.map(mapHistory) })
})

// ── POST /crm/leads/:id/history ──────────────────────────────────────────────
router.post('/leads/:id/history', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  const note = String(req.body.note || '').trim()
  if (!note) return res.status(400).json({ ok: false, message: 'Observação obrigatória' })

  const { rows: [history] } = await query(
    `INSERT INTO crm_lead_history (tenant_id, lead_id, user_id, action, note)
     VALUES ($1,$2,$3,'note',$4) RETURNING *`,
    [req.user.tenant_id, req.params.id, req.user.id, note]
  )
  await query(`UPDATE crm_leads SET last_interaction_at=NOW(), updated_at=NOW() WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.user.tenant_id])
  return res.status(201).json({ ok: true, data: mapHistory(history) })
})

// ── CRM Campanhas / Comunicação — Fase 4 ─────────────────────────────────────
const campaignSchema = Joi.object({
  name: Joi.string().trim().min(2).max(180).required(),
  channel: Joi.string().valid('email', 'sms').required(),
  template_id: Joi.string().uuid().optional().allow(null, ''),
  subject: Joi.string().trim().max(220).optional().allow('', null),
  body: Joi.string().trim().min(2).max(12000).required(),
  target_filter: Joi.object({
    stage_id: Joi.string().uuid().optional().allow('', null),
    responsible_id: Joi.string().uuid().optional().allow('', null),
    source: Joi.string().trim().max(80).optional().allow('', null),
    temperature: Joi.string().valid('frio', 'morno', 'quente', '').optional().allow(null),
    min_score: Joi.number().integer().min(0).max(100).optional().allow(null),
    campaign: Joi.string().trim().max(160).optional().allow('', null),
    q: Joi.string().trim().max(160).optional().allow('', null),
  }).default({}),
  scheduled_at: Joi.date().iso().optional().allow(null, ''),
})

const templateSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160).required(),
  channel: Joi.string().valid('email', 'sms').required(),
  subject: Joi.string().trim().max(220).optional().allow('', null),
  body: Joi.string().trim().min(2).max(12000).required(),
  is_active: Joi.boolean().default(true),
})

function normalizePhoneBR(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('55') && digits.length >= 12) return `+${digits}`
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`
  return digits.startsWith('+') ? digits : `+${digits}`
}

function renderMessageTemplate(text, lead = {}) {
  const values = {
    nome: lead.name || '',
    telefone: lead.phone || '',
    email: lead.email || '',
    empreendimento: lead.empreendimento || 'o empreendimento',
    campanha: lead.campaign || '',
    origem: sourceLabelServer(lead.source),
    responsavel: lead.responsible_name || '',
  }
  return String(text || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => values[key] ?? '')
}

function sourceLabelServer(value) {
  const labels = {
    instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp', site: 'Site', indicacao: 'Indicação', portal: 'Portal', meta_ads: 'Meta Ads', google_ads: 'Google Ads', outros: 'Outros'
  }
  return labels[value] || value || 'Outros'
}

function previewText(text) {
  return String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500)
}

async function getAwsMessagingConfig(tenantId) {
  const { rows } = await query(
    `SELECT ses_region, ses_access_key_id, ses_secret_access_key, ses_from_email, ses_from_name,
            sns_region, sns_access_key_id, sns_secret_access_key, sns_default_sender_id, sns_default_topic_arn
       FROM hub_tenant_configs
      WHERE tenant_id = $1`,
    [tenantId]
  )
  return rows[0] || {}
}

async function sendCampaignEmail({ tenantId, toEmail, fromName, subject, body }) {
  const cfg = await getAwsMessagingConfig(tenantId)
  if (!cfg.ses_access_key_id || !cfg.ses_secret_access_key || !cfg.ses_from_email) {
    throw new Error('AWS SES não configurado para este tenant')
  }
  const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses')
  const client = new SESClient({
    region: cfg.ses_region || 'us-east-1',
    credentials: {
      accessKeyId: cfg.ses_access_key_id,
      secretAccessKey: cfg.ses_secret_access_key,
    },
  })
  const source = `${cfg.ses_from_name || fromName || 'Santa Clara HUB'} <${cfg.ses_from_email}>`
  const result = await client.send(new SendEmailCommand({
    Source: source,
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Subject: { Data: subject || 'Contato comercial', Charset: 'UTF-8' },
      Body: {
        Html: { Data: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">${String(body || '').replace(/\n/g, '<br/>')}</div>`, Charset: 'UTF-8' },
        Text: { Data: String(body || '').replace(/<[^>]+>/g, ''), Charset: 'UTF-8' },
      },
    },
  }))
  return result.MessageId || ''
}

async function sendCampaignSms({ tenantId, toPhone, body }) {
  const cfg = await getAwsMessagingConfig(tenantId)
  const accessKeyId = cfg.sns_access_key_id || cfg.ses_access_key_id
  const secretAccessKey = cfg.sns_secret_access_key || cfg.ses_secret_access_key
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS SNS não configurado para este tenant')
  }
  const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns')
  const client = new SNSClient({
    region: cfg.sns_region || cfg.ses_region || 'us-east-1',
    credentials: { accessKeyId, secretAccessKey },
  })
  const params = {
    PhoneNumber: normalizePhoneBR(toPhone),
    Message: String(body || '').slice(0, 1400),
  }
  if (cfg.sns_default_sender_id) {
    params.MessageAttributes = {
      'AWS.SNS.SMS.SenderID': { DataType: 'String', StringValue: String(cfg.sns_default_sender_id).slice(0, 11) },
      'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' },
    }
  }
  const result = await client.send(new PublishCommand(params))
  return result.MessageId || ''
}

function buildCampaignLeadWhere(filter = {}, channel = 'email', baseIndex = 1) {
  const where = ['l.tenant_id = $1', 'l.is_active = true']
  const params = []
  let idx = baseIndex

  if (channel === 'email') where.push(`NULLIF(l.email,'') IS NOT NULL AND COALESCE(l.email_opt_out,false)=false`)
  if (channel === 'sms') where.push(`NULLIF(l.phone,'') IS NOT NULL AND COALESCE(l.sms_opt_out,false)=false`)
  if (filter.stage_id) { params.push(filter.stage_id); idx += 1; where.push(`l.stage_id = $${idx}`) }
  if (filter.responsible_id) { params.push(filter.responsible_id); idx += 1; where.push(`l.responsible_id = $${idx}`) }
  if (filter.source) { params.push(filter.source); idx += 1; where.push(`l.source = $${idx}`) }
  if (filter.temperature) { params.push(filter.temperature); idx += 1; where.push(`l.temperature = $${idx}`) }
  if (filter.min_score !== undefined && filter.min_score !== null && filter.min_score !== '') { params.push(Number(filter.min_score)); idx += 1; where.push(`COALESCE(l.score,0) >= $${idx}`) }
  if (filter.campaign) { params.push(`%${filter.campaign}%`); idx += 1; where.push(`l.campaign ILIKE $${idx}`) }
  if (filter.q) {
    params.push(`%${String(filter.q).trim()}%`); idx += 1
    where.push(`(l.name ILIKE $${idx} OR l.phone ILIKE $${idx} OR l.email ILIKE $${idx} OR l.empreendimento ILIKE $${idx} OR l.notes ILIKE $${idx})`)
  }
  return { where, params }
}

async function prepareCampaignRecipients(campaignId, tenantId) {
  const { rows: [campaign] } = await query(
    `SELECT * FROM crm_campaigns WHERE id=$1 AND tenant_id=$2`,
    [campaignId, tenantId]
  )
  if (!campaign) throw Object.assign(new Error('Campanha não encontrada'), { statusCode: 404 })
  if (campaign.status === 'sending') throw Object.assign(new Error('Campanha em envio'), { statusCode: 400 })

  const filter = campaign.target_filter || {}
  const { where, params } = buildCampaignLeadWhere(filter, campaign.channel, 3)
  const qParams = [tenantId, ...params]

  await query(`DELETE FROM crm_campaign_recipients WHERE campaign_id=$1 AND tenant_id=$2 AND status IN ('pending','skipped')`, [campaignId, tenantId])

  const { rows } = await query(
    `INSERT INTO crm_campaign_recipients (tenant_id, campaign_id, lead_id, channel, email, phone, status)
     SELECT l.tenant_id, $2, l.id, $3, l.email, l.phone,
            CASE
              WHEN $3='email' AND (NULLIF(l.email,'') IS NULL OR COALESCE(l.email_opt_out,false)=true) THEN 'skipped'
              WHEN $3='sms' AND (NULLIF(l.phone,'') IS NULL OR COALESCE(l.sms_opt_out,false)=true) THEN 'skipped'
              ELSE 'pending'
            END AS status
       FROM crm_leads l
      WHERE ${where.join(' AND ')}
     ON CONFLICT (campaign_id, lead_id, channel) DO NOTHING
     RETURNING status`,
    [tenantId, campaignId, campaign.channel, ...params]
  )

  const total = rows.length
  const skipped = rows.filter(r => r.status === 'skipped').length
  await query(
    `UPDATE crm_campaigns SET total_recipients=$1, skipped_count=$2, updated_at=NOW() WHERE id=$3 AND tenant_id=$4`,
    [total, skipped, campaignId, tenantId]
  )
  return { total, skipped }
}

// ── GET /crm/templates ──────────────────────────────────────────────────────
router.get('/templates', async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM crm_message_templates WHERE tenant_id=$1 ORDER BY channel ASC, name ASC`,
    [req.user.tenant_id]
  )
  return res.json({ ok: true, data: rows })
})

// ── POST /crm/templates ─────────────────────────────────────────────────────
router.post('/templates', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  const { error, value } = templateSchema.validate(req.body)
  if (error) return res.status(400).json({ ok: false, message: error.details[0].message })
  const { rows: [template] } = await query(
    `INSERT INTO crm_message_templates (tenant_id, name, channel, subject, body, is_active, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (tenant_id, name, channel) DO UPDATE SET
       subject=EXCLUDED.subject,
       body=EXCLUDED.body,
       is_active=EXCLUDED.is_active,
       updated_at=NOW()
     RETURNING *`,
    [req.user.tenant_id, value.name, value.channel, value.subject || null, value.body, value.is_active, req.user.id]
  )
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'crm_template_save', module: 'crm', entityType: 'crm_message_templates', entityId: template.id, meta: { name: template.name, channel: template.channel } }).catch(() => {})
  return res.status(201).json({ ok: true, data: template })
})

router.put('/templates/:id', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  const { error, value } = templateSchema.validate(req.body)
  if (error) return res.status(400).json({ ok: false, message: error.details[0].message })
  const { rows } = await query(
    `UPDATE crm_message_templates
        SET name=$1, channel=$2, subject=$3, body=$4, is_active=$5, updated_at=NOW()
      WHERE id=$6 AND tenant_id=$7
      RETURNING *`,
    [value.name, value.channel, value.subject || null, value.body, value.is_active, req.params.id, req.user.tenant_id]
  )
  if (!rows.length) return res.status(404).json({ ok: false, message: 'Template não encontrado' })
  return res.json({ ok: true, data: rows[0] })
})

router.delete('/templates/:id', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  await query(`UPDATE crm_message_templates SET is_active=false, updated_at=NOW() WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.user.tenant_id])
  return res.json({ ok: true })
})

// ── GET /crm/campaigns ──────────────────────────────────────────────────────
router.get('/campaigns', async (req, res) => {
  const { rows } = await query(
    `SELECT c.*,
            t.name AS template_name,
            u.name AS created_by_name,
            COALESCE(r.pending,0)::int AS pending_count
       FROM crm_campaigns c
       LEFT JOIN crm_message_templates t ON t.id = c.template_id
       LEFT JOIN hub_users u ON u.id = c.created_by
       LEFT JOIN LATERAL (
         SELECT COUNT(*) FILTER (WHERE status='pending') AS pending
           FROM crm_campaign_recipients cr
          WHERE cr.campaign_id = c.id
       ) r ON true
      WHERE c.tenant_id=$1
      ORDER BY c.created_at DESC
      LIMIT 100`,
    [req.user.tenant_id]
  )
  return res.json({ ok: true, data: rows })
})

router.post('/campaigns', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  const { error, value } = campaignSchema.validate(req.body)
  if (error) return res.status(400).json({ ok: false, message: error.details[0].message })

  const { rows: [campaign] } = await query(
    `INSERT INTO crm_campaigns
       (tenant_id, name, channel, status, template_id, subject, body, target_filter, scheduled_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
     RETURNING *`,
    [
      req.user.tenant_id,
      value.name,
      value.channel,
      value.scheduled_at ? 'scheduled' : 'draft',
      value.template_id || null,
      value.subject || null,
      value.body,
      JSON.stringify(value.target_filter || {}),
      value.scheduled_at || null,
      req.user.id,
    ]
  )
  const prepared = await prepareCampaignRecipients(campaign.id, req.user.tenant_id)
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'crm_campaign_create', module: 'crm', entityType: 'crm_campaigns', entityId: campaign.id, meta: { name: campaign.name, channel: campaign.channel, recipients: prepared.total } }).catch(() => {})
  return res.status(201).json({ ok: true, data: { ...campaign, total_recipients: prepared.total, skipped_count: prepared.skipped } })
})

router.get('/campaigns/:id/recipients', async (req, res) => {
  const { rows } = await query(
    `SELECT r.*, l.name AS lead_name, l.source, l.empreendimento
       FROM crm_campaign_recipients r
       LEFT JOIN crm_leads l ON l.id = r.lead_id
      WHERE r.tenant_id=$1 AND r.campaign_id=$2
      ORDER BY r.created_at ASC
      LIMIT 500`,
    [req.user.tenant_id, req.params.id]
  )
  return res.json({ ok: true, data: rows })
})

router.post('/campaigns/:id/prepare', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  const prepared = await prepareCampaignRecipients(req.params.id, req.user.tenant_id)
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'crm_campaign_prepare', module: 'crm', entityType: 'crm_campaigns', entityId: req.params.id, meta: prepared }).catch(() => {})
  return res.json({ ok: true, data: prepared })
})

router.post('/campaigns/:id/cancel', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  await query(`UPDATE crm_campaigns SET status='cancelled', updated_at=NOW() WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.user.tenant_id])
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'crm_campaign_cancel', module: 'crm', entityType: 'crm_campaigns', entityId: req.params.id }).catch(() => {})
  return res.json({ ok: true })
})

router.post('/campaigns/:id/send', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  const limit = Math.min(Number(req.body?.limit || 300), 500)
  const { rows: [campaign] } = await query(
    `SELECT * FROM crm_campaigns WHERE id=$1 AND tenant_id=$2`,
    [req.params.id, req.user.tenant_id]
  )
  if (!campaign) return res.status(404).json({ ok: false, message: 'Campanha não encontrada' })
  if (['sent','cancelled','sending'].includes(campaign.status)) return res.status(400).json({ ok: false, message: `Campanha está com status ${campaign.status}` })

  let { rows: recipients } = await query(
    `SELECT r.*, l.name, l.phone AS lead_phone, l.email AS lead_email, l.source, l.campaign, l.empreendimento, u.name AS responsible_name
       FROM crm_campaign_recipients r
       LEFT JOIN crm_leads l ON l.id = r.lead_id
       LEFT JOIN hub_users u ON u.id = l.responsible_id
      WHERE r.tenant_id=$1 AND r.campaign_id=$2 AND r.status='pending'
      ORDER BY r.created_at ASC
      LIMIT $3`,
    [req.user.tenant_id, req.params.id, limit]
  )

  if (!recipients.length) {
    const prepared = await prepareCampaignRecipients(req.params.id, req.user.tenant_id)
    const fresh = await query(
      `SELECT r.*, l.name, l.phone AS lead_phone, l.email AS lead_email, l.source, l.campaign, l.empreendimento, u.name AS responsible_name
         FROM crm_campaign_recipients r
         LEFT JOIN crm_leads l ON l.id = r.lead_id
         LEFT JOIN hub_users u ON u.id = l.responsible_id
        WHERE r.tenant_id=$1 AND r.campaign_id=$2 AND r.status='pending'
        ORDER BY r.created_at ASC
        LIMIT $3`,
      [req.user.tenant_id, req.params.id, limit]
    )
    recipients = fresh.rows
    if (!recipients.length) return res.status(400).json({ ok: false, message: `Nenhum destinatário válido encontrado. Preparados: ${prepared.total}` })
  }

  await query(`UPDATE crm_campaigns SET status='sending', started_at=COALESCE(started_at,NOW()), updated_at=NOW() WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.user.tenant_id])

  let sent = 0
  let failed = 0
  for (const recipient of recipients) {
    const lead = {
      name: recipient.name || 'Cliente',
      phone: recipient.lead_phone || recipient.phone || '',
      email: recipient.lead_email || recipient.email || '',
      source: recipient.source || 'outros',
      campaign: recipient.campaign || '',
      empreendimento: recipient.empreendimento || '',
      responsible_name: recipient.responsible_name || '',
    }
    const subject = renderMessageTemplate(campaign.subject || '', lead)
    const body = renderMessageTemplate(campaign.body || '', lead)
    try {
      const providerId = campaign.channel === 'email'
        ? await sendCampaignEmail({ tenantId: req.user.tenant_id, toEmail: recipient.email, fromName: 'Santa Clara HUB', subject, body })
        : await sendCampaignSms({ tenantId: req.user.tenant_id, toPhone: recipient.phone, body })

      await query(
        `UPDATE crm_campaign_recipients SET status='sent', provider_message_id=$1, sent_at=NOW(), updated_at=NOW() WHERE id=$2`,
        [providerId, recipient.id]
      )
      await query(
        `INSERT INTO crm_communication_events
          (tenant_id, lead_id, campaign_id, channel, direction, subject, body_preview, status, provider, provider_message_id, sent_by)
         VALUES ($1,$2,$3,$4,'outbound',$5,$6,'sent',$7,$8,$9)`,
        [req.user.tenant_id, recipient.lead_id, campaign.id, campaign.channel, subject || null, previewText(body), campaign.channel === 'email' ? 'aws_ses' : 'aws_sns', providerId, req.user.id]
      )
      if (recipient.lead_id) {
        await query(
          `INSERT INTO crm_lead_history (tenant_id, lead_id, user_id, action, note, metadata)
           VALUES ($1,$2,$3,'communication_sent',$4,$5)`,
          [req.user.tenant_id, recipient.lead_id, req.user.id, `Campanha enviada: ${campaign.name}`, JSON.stringify({ campaign_id: campaign.id, channel: campaign.channel })]
        ).catch(() => {})
        await query(`UPDATE crm_leads SET last_interaction_at=NOW(), updated_at=NOW() WHERE id=$1 AND tenant_id=$2`, [recipient.lead_id, req.user.tenant_id]).catch(() => {})
      }
      sent += 1
    } catch (err) {
      failed += 1
      await query(
        `UPDATE crm_campaign_recipients SET status='failed', error_message=$1, updated_at=NOW() WHERE id=$2`,
        [err.message, recipient.id]
      )
      await query(
        `INSERT INTO crm_communication_events
          (tenant_id, lead_id, campaign_id, channel, direction, subject, body_preview, status, provider, error_message, sent_by)
         VALUES ($1,$2,$3,$4,'outbound',$5,$6,'failed',$7,$8,$9)`,
        [req.user.tenant_id, recipient.lead_id, campaign.id, campaign.channel, subject || null, previewText(body), campaign.channel === 'email' ? 'aws_ses' : 'aws_sns', err.message, req.user.id]
      ).catch(() => {})
    }
  }

  const { rows: [stats] } = await query(
    `SELECT COUNT(*) FILTER (WHERE status='sent')::int AS sent_count,
            COUNT(*) FILTER (WHERE status='failed')::int AS failed_count,
            COUNT(*) FILTER (WHERE status='skipped')::int AS skipped_count,
            COUNT(*) FILTER (WHERE status='pending')::int AS pending_count,
            COUNT(*)::int AS total_recipients
       FROM crm_campaign_recipients
      WHERE campaign_id=$1 AND tenant_id=$2`,
    [campaign.id, req.user.tenant_id]
  )
  const finalStatus = Number(stats.pending_count || 0) > 0 ? 'draft' : (Number(stats.failed_count || 0) > 0 && Number(stats.sent_count || 0) === 0 ? 'failed' : 'sent')
  await query(
    `UPDATE crm_campaigns
        SET status=$1, sent_count=$2, failed_count=$3, skipped_count=$4, total_recipients=$5,
            completed_at=CASE WHEN $6::int = 0 THEN NOW() ELSE completed_at END,
            updated_at=NOW()
      WHERE id=$7 AND tenant_id=$8`,
    [finalStatus, stats.sent_count, stats.failed_count, stats.skipped_count, stats.total_recipients, stats.pending_count, campaign.id, req.user.tenant_id]
  )
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'crm_campaign_send', module: 'crm', entityType: 'crm_campaigns', entityId: campaign.id, meta: { sent, failed, pending: stats.pending_count } }).catch(() => {})
  return res.json({ ok: true, data: { sent, failed, ...stats, status: finalStatus } })
})

router.get('/communications', async (req, res) => {
  const params = [req.user.tenant_id]
  const where = ['e.tenant_id=$1']
  if (req.query.lead_id) { params.push(req.query.lead_id); where.push(`e.lead_id=$${params.length}`) }
  if (req.query.campaign_id) { params.push(req.query.campaign_id); where.push(`e.campaign_id=$${params.length}`) }
  const { rows } = await query(
    `SELECT e.*, l.name AS lead_name, c.name AS campaign_name, u.name AS sent_by_name
       FROM crm_communication_events e
       LEFT JOIN crm_leads l ON l.id = e.lead_id
       LEFT JOIN crm_campaigns c ON c.id = e.campaign_id
       LEFT JOIN hub_users u ON u.id = e.sent_by
      WHERE ${where.join(' AND ')}
      ORDER BY e.created_at DESC
      LIMIT 300`,
    params
  )
  return res.json({ ok: true, data: rows })
})

router.patch('/leads/:id/consent', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  const emailOptOut = Boolean(req.body.email_opt_out)
  const smsOptOut = Boolean(req.body.sms_opt_out)
  const { rows } = await query(
    `UPDATE crm_leads SET email_opt_out=$1, sms_opt_out=$2, updated_at=NOW()
      WHERE id=$3 AND tenant_id=$4
      RETURNING *`,
    [emailOptOut, smsOptOut, req.params.id, req.user.tenant_id]
  )
  if (!rows.length) return res.status(404).json({ ok: false, message: 'Lead não encontrado' })
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'crm_lead_consent_update', module: 'crm', entityType: 'crm_leads', entityId: req.params.id, meta: { email_opt_out: emailOptOut, sms_opt_out: smsOptOut } }).catch(() => {})
  return res.json({ ok: true, data: mapLead(rows[0]) })
})

// ── END ORIGINAL ──
// ─────────────────────────────────────────────────────────────────────────────
// CRM v0.1.5 — LISTAS INTELIGENTES
// ─────────────────────────────────────────────────────────────────────────────

// GET /crm/smart-lists
router.get('/smart-lists', async (req, res) => {
  const { rows } = await query(
    `SELECT id, name, icon, filters, position, created_at
       FROM crm_smart_lists
      WHERE tenant_id = $1
      ORDER BY position, created_at`,
    [req.user.tenant_id]
  )
  return res.json({ ok: true, data: rows })
})

// POST /crm/smart-lists
router.post('/smart-lists', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  const name    = String(req.body.name || '').trim()
  const icon    = String(req.body.icon || 'filter').trim()
  const filters = req.body.filters || {}
  if (!name) return res.status(400).json({ ok: false, message: 'Nome obrigatório' })

  const { rows } = await query(
    `INSERT INTO crm_smart_lists (tenant_id, name, icon, filters, position, created_by)
     VALUES ($1, $2, $3, $4::jsonb,
             COALESCE((SELECT MAX(position)+1 FROM crm_smart_lists WHERE tenant_id=$1), 0),
             $5)
     ON CONFLICT (tenant_id, name) DO UPDATE
       SET filters = EXCLUDED.filters, icon = EXCLUDED.icon, updated_at = NOW()
     RETURNING *`,
    [req.user.tenant_id, name, icon, JSON.stringify(filters), req.user.id]
  )
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'crm_smart_list_save', module: 'crm', entityType: 'crm_smart_lists', entityId: rows[0].id, meta: { name } }).catch(() => {})
  return res.status(201).json({ ok: true, data: rows[0] })
})

// DELETE /crm/smart-lists/:id
router.delete('/smart-lists/:id', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  await query(
    `DELETE FROM crm_smart_lists WHERE id=$1 AND tenant_id=$2`,
    [req.params.id, req.user.tenant_id]
  )
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'crm_smart_list_delete', module: 'crm', entityType: 'crm_smart_lists', entityId: req.params.id }).catch(() => {})
  return res.json({ ok: true })
})

// ─────────────────────────────────────────────────────────────────────────────
// CRM v0.1.5 — AÇÕES EM MASSA
// ─────────────────────────────────────────────────────────────────────────────

// POST /crm/leads/bulk-update   { ids: string[], updates: { stage_id?, responsible_id?, temperature? } }
router.post('/leads/bulk-update', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  const ids     = (req.body.ids || []).filter(Boolean)
  const updates = req.body.updates || {}
  if (!ids.length) return res.status(400).json({ ok: false, message: 'Nenhum lead selecionado' })

  const setClauses = []
  const params     = [req.user.tenant_id]

  if (updates.stage_id !== undefined) {
    params.push(updates.stage_id || null)
    setClauses.push(`stage_id = $${params.length}`)
  }
  if (updates.responsible_id !== undefined) {
    params.push(updates.responsible_id || null)
    setClauses.push(`responsible_id = $${params.length}`)
  }
  if (updates.temperature !== undefined) {
    params.push(updates.temperature)
    setClauses.push(`temperature = $${params.length}`)
  }
  if (!setClauses.length) return res.status(400).json({ ok: false, message: 'Nenhum campo para atualizar' })

  setClauses.push('updated_at = NOW()')
  params.push(ids)
  const sql = `UPDATE crm_leads SET ${setClauses.join(', ')} WHERE tenant_id=$1 AND id = ANY($${params.length}) AND is_active=true`
  const { rowCount } = await query(sql, params)

  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'crm_leads_bulk_update', module: 'crm', entityType: 'crm_leads', meta: { ids, updates, rowCount } }).catch(() => {})
  return res.json({ ok: true, updated: rowCount })
})

// POST /crm/leads/bulk-delete   { ids: string[] }
router.post('/leads/bulk-delete', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  const ids = (req.body.ids || []).filter(Boolean)
  if (!ids.length) return res.status(400).json({ ok: false, message: 'Nenhum lead selecionado' })

  const { rowCount } = await query(
    `UPDATE crm_leads SET is_active=false, updated_at=NOW()
      WHERE tenant_id=$1 AND id = ANY($2) AND is_active=true`,
    [req.user.tenant_id, ids]
  )
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'crm_leads_bulk_delete', module: 'crm', entityType: 'crm_leads', meta: { ids, rowCount } }).catch(() => {})
  return res.json({ ok: true, deleted: rowCount })
})

// ─────────────────────────────────────────────────────────────────────────────
// CRM v0.1.5 — FILA DE AÇÕES MANUAIS
// ─────────────────────────────────────────────────────────────────────────────

// GET /crm/manual-actions?type=ligacao&responsible_id=&status=pendente
router.get('/manual-actions', async (req, res) => {
  const { type, responsible_id, status = 'pendente' } = req.query

  const conditions = ['t.tenant_id = $1', `t.status = $2`]
  const params     = [req.user.tenant_id, status]

  if (type && type !== 'all') {
    params.push(type)
    conditions.push(`t.type = $${params.length}`)
  }
  if (responsible_id && responsible_id !== 'all') {
    params.push(responsible_id)
    conditions.push(`t.responsible_id = $${params.length}`)
  }

  const { rows } = await query(
    `SELECT
        t.id,
        t.lead_id,
        t.title,
        t.description,
        t.type,
        t.due_at,
        t.priority,
        t.status,
        t.created_at,
        l.name      AS lead_name,
        l.phone     AS lead_phone,
        s.name      AS stage_name,
        s.color     AS stage_color,
        u.name      AS responsible_name
      FROM crm_lead_tasks t
      LEFT JOIN crm_leads         l ON l.id = t.lead_id
      LEFT JOIN crm_funnel_stages s ON s.id = l.stage_id
      LEFT JOIN hub_users         u ON u.id = t.responsible_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY
       CASE t.priority WHEN 'urgente' THEN 1 WHEN 'alta' THEN 2 WHEN 'media' THEN 3 ELSE 4 END,
       t.due_at ASC NULLS LAST,
       t.created_at ASC
     LIMIT 200`,
    params
  )
  return res.json({ ok: true, data: rows })
})


// ─────────────────────────────────────────────────────────────────────────────
// CRM v0.1.6 — CONVERSAS (inbox, eventos, SLA)
// ─────────────────────────────────────────────────────────────────────────────

// GET /crm/conversations?filter=all|unread|starred&responsible_id=
router.get('/conversations', async (req, res) => {
  const { filter = 'all', responsible_id } = req.query
  const params  = [req.user.tenant_id]
  const having  = []
  const where   = ['l.tenant_id = $1', 'l.is_active = true']

  if (responsible_id && responsible_id !== 'all') {
    params.push(responsible_id)
    where.push(`l.responsible_id = $${params.length}`)
  }

  const { rows } = await query(
    `SELECT
        l.id          AS lead_id,
        l.name        AS lead_name,
        l.phone       AS lead_phone,
        l.email       AS lead_email,
        s.name        AS stage_name,
        s.color       AS stage_color,
        u.name        AS responsible_name,
        cv.is_starred,
        cv.is_unread,
        cv.last_event_at,
        cv.last_event_preview,
        cv.sla_first_response_met,
        cv.sla_resolution_met,
        (SELECT COUNT(*) FROM crm_communication_events e WHERE e.lead_id = l.id AND e.tenant_id = l.tenant_id) +
        (SELECT COUNT(*) FROM crm_lead_history h       WHERE h.lead_id = l.id AND h.tenant_id = l.tenant_id)
          AS event_count
      FROM crm_leads l
      LEFT JOIN crm_funnel_stages  s  ON s.id = l.stage_id
      LEFT JOIN hub_users          u  ON u.id = l.responsible_id
      LEFT JOIN crm_conversations  cv ON cv.lead_id = l.id AND cv.tenant_id = l.tenant_id
     WHERE ${where.join(' AND ')}
       AND (
         cv.last_event_at IS NOT NULL
         OR EXISTS (SELECT 1 FROM crm_communication_events e WHERE e.lead_id = l.id AND e.tenant_id = l.tenant_id)
         OR EXISTS (SELECT 1 FROM crm_lead_history         h WHERE h.lead_id = l.id AND h.tenant_id = l.tenant_id)
       )
       ${filter === 'unread'  ? 'AND cv.is_unread  = true' : ''}
       ${filter === 'starred' ? 'AND cv.is_starred = true' : ''}
     ORDER BY COALESCE(cv.last_event_at, (
       SELECT MAX(created_at) FROM crm_lead_history h WHERE h.lead_id = l.id AND h.tenant_id = l.tenant_id
     )) DESC NULLS LAST
     LIMIT 150`,
    params
  )
  return res.json({ ok: true, data: rows })
})

// GET /crm/conversations/:leadId/events  — merged history + communication events
router.get('/conversations/:leadId/events', async (req, res) => {
  const leadId = req.params.leadId

  const [historyRes, commRes] = await Promise.all([
    query(
      `SELECT
          h.id,
          'history'          AS source,
          h.action,
          NULL               AS channel,
          NULL               AS direction,
          h.note             AS body,
          h.from_stage_name,
          h.to_stage_name,
          h.user_name,
          h.created_at
        FROM crm_lead_history h
       WHERE h.lead_id = $1 AND h.tenant_id = $2
       ORDER BY h.created_at ASC`,
      [leadId, req.user.tenant_id]
    ),
    query(
      `SELECT
          e.id,
          'communication'    AS source,
          NULL               AS action,
          e.channel,
          e.direction,
          e.body_preview     AS body,
          NULL               AS from_stage_name,
          NULL               AS to_stage_name,
          u.name             AS user_name,
          e.created_at
        FROM crm_communication_events e
        LEFT JOIN hub_users u ON u.id = e.sent_by
       WHERE e.lead_id = $1 AND e.tenant_id = $2
       ORDER BY e.created_at ASC`,
      [leadId, req.user.tenant_id]
    )
  ])

  // Merge and sort by date
  const merged = [...historyRes.rows, ...commRes.rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  // Mark conversation as read
  await query(
    `INSERT INTO crm_conversations (tenant_id, lead_id, is_unread)
     VALUES ($1, $2, false)
     ON CONFLICT (tenant_id, lead_id) DO UPDATE SET is_unread = false, updated_at = NOW()`,
    [req.user.tenant_id, leadId]
  ).catch(() => {})

  return res.json({ ok: true, data: merged })
})

// POST /crm/conversations/:leadId/events  — log a new event
router.post('/conversations/:leadId/events', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  const leadId  = req.params.leadId
  const channel = String(req.body.channel || 'nota').trim()
  const body    = String(req.body.body || '').trim()
  if (!body) return res.status(400).json({ ok: false, message: 'Mensagem obrigatória' })

  const allowed = ['email', 'sms', 'whatsapp', 'ligacao', 'nota']
  if (!allowed.includes(channel)) return res.status(400).json({ ok: false, message: 'Canal inválido' })

  // Insert into communication_events
  const { rows: [evt] } = await query(
    `INSERT INTO crm_communication_events
       (tenant_id, lead_id, channel, direction, body_preview, status, sent_by)
     VALUES ($1, $2, $3, 'outbound', $4, 'sent', $5)
     RETURNING id, created_at`,
    [req.user.tenant_id, leadId, channel, body.slice(0, 300), req.user.id]
  )

  // Also log in lead history as a note
  await query(
    `INSERT INTO crm_lead_history (tenant_id, lead_id, action, note, user_id, user_name)
     SELECT $1, $2, $3, $4, $5, name FROM hub_users WHERE id = $5`,
    [req.user.tenant_id, leadId, `${channel}_manual`, body, req.user.id]
  ).catch(() => {})

  // Update conversation metadata
  const preview = body.slice(0, 120)
  await query(
    `INSERT INTO crm_conversations (tenant_id, lead_id, is_unread, last_event_at, last_event_preview)
     VALUES ($1, $2, false, NOW(), $3)
     ON CONFLICT (tenant_id, lead_id) DO UPDATE
       SET is_unread = false, last_event_at = NOW(), last_event_preview = $3, updated_at = NOW()`,
    [req.user.tenant_id, leadId, preview]
  ).catch(() => {})

  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'crm_conversation_event', module: 'crm', entityType: 'crm_communication_events', entityId: evt.id, meta: { channel, leadId } }).catch(() => {})
  return res.status(201).json({ ok: true, data: evt })
})

// PATCH /crm/conversations/:leadId  — toggle starred/unread
router.patch('/conversations/:leadId', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  const updates = []
  const params  = [req.user.tenant_id, req.params.leadId]

  if (typeof req.body.is_starred === 'boolean') {
    updates.push(`is_starred = $${params.length + 1}`)
    params.push(req.body.is_starred)
  }
  if (typeof req.body.is_unread === 'boolean') {
    updates.push(`is_unread = $${params.length + 1}`)
    params.push(req.body.is_unread)
  }
  if (!updates.length) return res.status(400).json({ ok: false, message: 'Nada para atualizar' })

  updates.push('updated_at = NOW()')
  await query(
    `INSERT INTO crm_conversations (tenant_id, lead_id, ${req.body.is_starred !== undefined ? 'is_starred' : 'is_unread'})
     VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, lead_id) DO UPDATE SET ${updates.join(', ')}`,
    params
  )
  return res.json({ ok: true })
})

// ─────────────────────────────────────────────────────────────────────────────
// CRM v0.1.6 — SLA CONFIG + STATS
// ─────────────────────────────────────────────────────────────────────────────

// GET /crm/sla-config
router.get('/sla-config', async (req, res) => {
  const { rows } = await query(
    `SELECT is_active, first_response_minutes, resolution_minutes
       FROM crm_sla_configs WHERE tenant_id = $1`,
    [req.user.tenant_id]
  )
  return res.json({ ok: true, data: rows[0] || { is_active: false, first_response_minutes: 60, resolution_minutes: 480 } })
})

// POST /crm/sla-config
router.post('/sla-config', async (req, res) => {
  if (!(await requireCrmWrite(req, res))) return
  const isActive             = Boolean(req.body.is_active)
  const firstResponseMinutes = Math.max(1, Number(req.body.first_response_minutes) || 60)
  const resolutionMinutes    = Math.max(1, Number(req.body.resolution_minutes) || 480)

  const { rows: [cfg] } = await query(
    `INSERT INTO crm_sla_configs (tenant_id, is_active, first_response_minutes, resolution_minutes)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id) DO UPDATE
       SET is_active = $2, first_response_minutes = $3, resolution_minutes = $4, updated_at = NOW()
     RETURNING *`,
    [req.user.tenant_id, isActive, firstResponseMinutes, resolutionMinutes]
  )
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'crm_sla_config_save', module: 'crm', entityType: 'crm_sla_configs', entityId: cfg.id, meta: { isActive, firstResponseMinutes } }).catch(() => {})
  return res.json({ ok: true, data: cfg })
})

// GET /crm/sla-stats
router.get('/sla-stats', async (req, res) => {
  const [cfgRes, statsRes] = await Promise.all([
    query(`SELECT * FROM crm_sla_configs WHERE tenant_id=$1`, [req.user.tenant_id]),
    query(
      `SELECT
          COUNT(*)                                               AS total_conversations,
          COUNT(CASE WHEN cv.is_unread = true THEN 1 END)       AS unread_count,
          COUNT(CASE WHEN cv.is_starred = true THEN 1 END)      AS starred_count,
          COUNT(CASE WHEN cv.sla_first_response_met = true THEN 1 END)  AS sla_met,
          COUNT(CASE WHEN cv.sla_first_response_met = false THEN 1 END) AS sla_breached,
          ROUND(AVG(
            EXTRACT(EPOCH FROM (cv.first_response_at - cv.created_at)) / 60
          )::numeric, 1)                                        AS avg_first_response_min,
          COUNT(CASE WHEN cv.last_event_at > NOW() - INTERVAL '7 days' THEN 1 END) AS active_7d
        FROM crm_conversations cv
       WHERE cv.tenant_id = $1`,
      [req.user.tenant_id]
    )
  ])

  const cfg   = cfgRes.rows[0] || { is_active: false }
  const stats = statsRes.rows[0] || {}
  const total = Number(stats.total_conversations || 0)
  const met   = Number(stats.sla_met || 0)
  const sla_met_pct = total > 0 ? Math.round((met / total) * 100) : 0

  return res.json({
    ok: true,
    data: {
      sla_active: cfg.is_active,
      total_conversations:       total,
      unread_count:              Number(stats.unread_count || 0),
      starred_count:             Number(stats.starred_count || 0),
      sla_met:                   met,
      sla_breached:              Number(stats.sla_breached || 0),
      sla_met_pct,
      avg_first_response_min:    Number(stats.avg_first_response_min || 0),
      active_7d:                 Number(stats.active_7d || 0),
    }
  })
})

module.exports = router
