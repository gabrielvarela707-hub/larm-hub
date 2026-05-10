/**
 * src/routes/tenant-config.js
 * → server/src/routes/tenant-config.js
 */

const express = require('express')
const { query } = require('../config/database')
const { authenticate } = require('../middleware/authenticate')
const logger = require('../config/logger')

const router = express.Router()
router.use(authenticate)

// ── GET /tenant-config ────────────────────────────────────────────────────────
router.get('/tenant-config', async (req, res) => {
  const { tenant_id } = req.user
  try {
    const { rows } = await query(
      'SELECT * FROM hub_tenant_configs WHERE tenant_id = $1 LIMIT 1',
      [tenant_id]
    )

    if (!rows.length) return res.json({ ok: true, data: {} })

    const c = rows[0]
    return res.json({
      ok: true,
      data: {
        // Identidade visual
        logoUrl:            c.logo_url             || '',
        logoText:           c.logo_text            || 'LoteMobile',
        primaryColor:       c.primary_color        || '#2563EB',
        sidebarColor:       c.sidebar_color        || '#0D1B2A',
        // Google Maps
        googleMapsKey:      c.google_maps_key      || '',
        // AWS SES
        sesRegion:          c.ses_region           || 'us-east-1',
        sesAccessKeyId:     c.ses_access_key_id    || '',
        sesSecretAccessKey: c.ses_secret_access_key|| '',
        sesFromEmail:       c.ses_from_email       || '',
        sesFromName:        c.ses_from_name        || '',
        // AWS SNS
        snsRegion:          c.sns_region           || 'sa-east-1',
        snsAccessKeyId:     c.sns_access_key_id    || '',
        snsSecretAccessKey: c.sns_secret_access_key|| '',
        snsSenderId:        c.sns_sender_id        || 'LOTEAMENTO',
        snsSMSType:         c.sns_sms_type         || 'Transactional',
        snsMockMode:        c.sns_mock_mode        ?? true,
        // WhatsApp (por conta)
        whatsappToken:      c.whatsapp_token       || '',
        whatsappPhoneId:    c.whatsapp_phone_id    || '',
        whatsappBusinessId: c.whatsapp_business_id || '',
        // IA
        aiProvider:         c.ai_provider          || 'openai',
        openaiApiKey:       c.openai_api_key       || '',
        geminiApiKey:       c.gemini_api_key       || '',
        // Outros
        clicksignKey:       c.clicksign_key        || '',
        bankName:           c.bank_name            || '',
        bankApiKey:         c.bank_api_key         || '',
        crmConfig:          c.crm_config           || {},
      },
    })
  } catch (err) {
    logger.error('Erro ao buscar tenant-config:', err.message)
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ── PUT /tenant-config ────────────────────────────────────────────────────────
router.put('/tenant-config', async (req, res) => {
  const { tenant_id, role } = req.user

  if (!['admin', 'super_admin'].includes(role)) {
    return res.status(403).json({ ok: false, message: 'Apenas administradores podem alterar configurações' })
  }

  const b = req.body

  const mapped = {
    logo_url:              b.logoUrl,
    logo_text:             b.logoText,
    primary_color:         b.primaryColor,
    sidebar_color:         b.sidebarColor,
    google_maps_key:       b.googleMapsKey,
    // SES
    ses_region:            b.sesRegion,
    ses_access_key_id:     b.sesAccessKeyId,
    ses_secret_access_key: b.sesSecretAccessKey,
    ses_from_email:        b.sesFromEmail,
    ses_from_name:         b.sesFromName,
    // SNS
    sns_region:            b.snsRegion,
    sns_access_key_id:     b.snsAccessKeyId,
    sns_secret_access_key: b.snsSecretAccessKey,
    sns_sender_id:         b.snsSenderId,
    sns_sms_type:          b.snsSMSType,
    sns_mock_mode:         b.snsMockMode,
    // WhatsApp
    whatsapp_token:        b.whatsappToken,
    whatsapp_phone_id:     b.whatsappPhoneId,
    whatsapp_business_id:  b.whatsappBusinessId,
    // IA
    ai_provider:           ['openai', 'gemini'].includes(b.aiProvider) ? b.aiProvider : undefined,
    openai_api_key:        b.openaiApiKey,
    gemini_api_key:        b.geminiApiKey,
    // Outros
    clicksign_key:         b.clicksignKey,
    bank_name:             b.bankName,
    bank_api_key:          b.bankApiKey,
    crm_config:            b.crmConfig ? JSON.stringify(b.crmConfig) : undefined,
  }

  const fields = Object.entries(mapped).filter(([, v]) => v !== undefined && v !== null)
  if (!fields.length) return res.status(400).json({ ok: false, message: 'Nenhum campo válido enviado' })

  try {
    const cols      = fields.map(([c]) => c).join(', ')
    const vals      = fields.map(([, v]) => v)
    const placeholders = fields.map((_, i) => `$${i + 2}`).join(', ')
    const setClauses   = fields.map(([col], i) => `${col} = $${i + 2}`).join(', ')

    await query(
      `INSERT INTO hub_tenant_configs (tenant_id, ${cols}, updated_at)
       VALUES ($1, ${placeholders}, NOW())
       ON CONFLICT (tenant_id) DO UPDATE
         SET ${setClauses}, updated_at = NOW()`,
      [tenant_id, ...vals]
    )

    logger.info(`Tenant config salva: tenant=${tenant_id}`)
    return res.json({ ok: true, message: 'Configurações salvas com sucesso' })
  } catch (err) {
    logger.error('Erro ao salvar tenant-config:', err.message)
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ── POST /tenant-config/test-email ───────────────────────────────────────────
// Envia e-mail de teste via AWS SES SDK v3
router.post('/tenant-config/test-email', async (req, res) => {
  const { tenant_id, role } = req.user

  if (!['admin', 'super_admin'].includes(role)) {
    return res.status(403).json({ ok: false, message: 'Sem permissão' })
  }

  const { to } = req.body
  if (!to || !/^[^@]+@[^@]+\.[^@]+$/.test(to)) {
    return res.status(400).json({ ok: false, message: 'E-mail de destino inválido' })
  }

  try {
    const { rows } = await query(
      `SELECT ses_region, ses_access_key_id, ses_secret_access_key,
              ses_from_email, ses_from_name
       FROM hub_tenant_configs WHERE tenant_id = $1`,
      [tenant_id]
    )

    const cfg = rows[0]

    if (!cfg?.ses_access_key_id || !cfg?.ses_secret_access_key) {
      return res.status(422).json({ ok: false, message: 'Configure e salve as credenciais AWS SES antes de testar' })
    }
    if (!cfg.ses_from_email) {
      return res.status(422).json({ ok: false, message: 'Configure o e-mail remetente antes de testar' })
    }

    const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses')

    const client = new SESClient({
      region: cfg.ses_region || 'us-east-1',
      credentials: {
        accessKeyId:     cfg.ses_access_key_id,
        secretAccessKey: cfg.ses_secret_access_key,
      },
    })

    const fromName  = cfg.ses_from_name || 'LoteMobile'
    const fromEmail = cfg.ses_from_email

    await client.send(new SendEmailCommand({
      Source: `${fromName} <${fromEmail}>`,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: '✅ Teste de e-mail — LoteMobile HUB', Charset: 'UTF-8' },
        Body: {
          Html: {
            Charset: 'UTF-8',
            Data: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
              <h2 style="color:#1e3a5f">AWS SES funcionando!</h2>
              <p style="color:#475569;line-height:1.6">
                Configuração via <strong>AWS SES</strong> está ativa. Teste enviado pelo painel LoteMobile HUB.
              </p>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
              <p style="color:#94a3b8;font-size:12px">
                Remetente: ${fromEmail}<br/>Região: ${cfg.ses_region || 'us-east-1'}<br/>Destino: ${to}
              </p>
            </div>`,
          },
          Text: { Charset: 'UTF-8', Data: 'AWS SES funcionando. Teste enviado pelo LoteMobile HUB.' },
        },
      },
    }))

    logger.info(`Test email enviado para ${to} (tenant=${tenant_id})`)
    return res.json({ ok: true, message: `E-mail de teste enviado para ${to}` })
  } catch (err) {
    logger.error('Erro no test-email SES:', err.message)
    let msg = err.message
    if (err.name === 'InvalidClientTokenId')     msg = 'Access Key ID inválida'
    if (err.name === 'SignatureDoesNotMatch')     msg = 'Secret Access Key inválida'
    if (err.name === 'MessageRejected')          msg = 'Remetente não verificado no SES'
    if (err.name === 'SendingPaused')            msg = 'Conta SES em sandbox — verifique o destino no console AWS'
    return res.status(502).json({ ok: false, message: msg })
  }
})

module.exports = router
