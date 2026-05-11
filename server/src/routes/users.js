/**
 * server/src/routes/users.js
 * Gestão de usuários + sistema de convites com envio via AWS SES SDK v3
 */

const express    = require('express')
const bcrypt     = require('bcryptjs')
const crypto     = require('crypto')
const { query, transaction } = require('../config/database')
const { authenticate }       = require('../middleware/authenticate')
const logger     = require('../config/logger')

const router = express.Router()

// ── Rotas PÚBLICAS (sem auth) — ficam antes do middleware ────────────────────
// Definidas abaixo com router.get/post diretamente, pois authenticate
// ainda não foi aplicado neste ponto do arquivo.
// O router.use(authenticate) é aplicado logo após estas rotas públicas.



// ── Rotas PÚBLICAS (sem auth — validate e accept de convite) ─────────────────
// ── GET /users/invite/validate/:token — valida token (público) ────────────────
router.get('/users/invite/validate/:token', async (req, res) => {
  try {
    const { rows: [invite] } = await query(
      `SELECT i.*, t.name AS tenant_name, u.name AS invited_by_name
       FROM hub_invites i
       JOIN hub_tenants t ON t.id = i.tenant_id
       JOIN hub_users   u ON u.id = i.invited_by
       WHERE i.token = $1`,
      [req.params.token]
    )

    if (!invite) return res.status(404).json({ ok: false, message: 'Convite não encontrado' })
    if (invite.status !== 'pending') return res.status(410).json({ ok: false, message: `Convite ${invite.status}` })
    if (new Date(invite.expires_at) < new Date()) {
      await query("UPDATE hub_invites SET status='expired' WHERE id=$1", [invite.id])
      return res.status(410).json({ ok: false, message: 'Convite expirado' })
    }

    return res.json({
      ok: true,
      data: {
        name:           invite.name,
        email:          invite.email,
        role:           invite.role,
        tenant_name:    invite.tenant_name,
        invited_by:     invite.invited_by_name,
        custom_message: invite.custom_message,
        auto_activate:  invite.auto_activate,
        expires_at:     invite.expires_at,
      },
    })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ── POST /users/invite/accept/:token — aceita convite (público) ───────────────
router.post('/users/invite/accept/:token', async (req, res) => {
  const { password, name: overrideName } = req.body

  if (!password || password.length < 8) {
    return res.status(400).json({ ok: false, message: 'A senha deve ter no mínimo 8 caracteres' })
  }

  try {
    const { rows: [invite] } = await query(
      'SELECT * FROM hub_invites WHERE token=$1 AND status=\'pending\' AND expires_at > NOW()',
      [req.params.token]
    )

    if (!invite) return res.status(404).json({ ok: false, message: 'Convite inválido ou expirado' })

    const passwordHash = await bcrypt.hash(password, 12)
    const finalName    = overrideName?.trim() || invite.name

    await transaction(async (client) => {
      let userId = invite.user_id

      if (userId) {
        // Usuário já foi criado (auto_activate + senha temp) — só atualiza a senha
        await client.query(
          `UPDATE hub_users SET
             password_hash=$1, name=$2, must_change_password=false, updated_at=NOW()
           WHERE id=$3`,
          [passwordHash, finalName, userId]
        )
      } else {
        // Cria o usuário agora
        const { rows: [newUser] } = await client.query(
          `INSERT INTO hub_users
             (tenant_id, name, email, password_hash, role, is_active,
              must_change_password, invited_by, invited_at)
           VALUES ($1,$2,$3,$4,$5,$6,false,$7,NOW())
           RETURNING id`,
          [
            invite.tenant_id, finalName, invite.email, passwordHash,
            invite.role, invite.auto_activate,
            invite.invited_by,
          ]
        )
        userId = newUser.id
      }

      // Marca convite como aceito
      await client.query(
        `UPDATE hub_invites
         SET status='accepted', accepted_at=NOW(), user_id=$1
         WHERE id=$2`,
        [userId, invite.id]
      )

      // Vincula perfis ao usuário recém-criado
      const profileIds = (() => {
        try { return JSON.parse(invite.profile_ids || '[]') } catch { return [] }
      })()
      if (Array.isArray(profileIds) && profileIds.length) {
        for (const pid of profileIds) {
          await client.query(
            `INSERT INTO hub_user_profiles (user_id, profile_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [userId, pid]
          ).catch(() => {})
        }
      }
    })

    logger.info(`Convite aceito: ${invite.email} [${invite.role}]`)
    return res.json({ ok: true, message: 'Conta criada com sucesso! Faça seu login.' })
  } catch (err) {
    logger.error('Erro ao aceitar convite:', err.message)
    return res.status(500).json({ ok: false, message: err.message })
  }
})


// ── Middleware de autenticação — aplica a todas as rotas abaixo ───────────────
router.use(authenticate)

// ── Helpers ───────────────────────────────────────────────────────────────────

function getFrontendUrl() {
  const url = process.env.FRONTEND_URL || 'https://larm-hub.vercel.app'
  return url.replace(/\/$/, '') // remove trailing slash
}

/**
 * Envia e-mail de convite via AWS SES SDK v3.
 * Busca as credenciais do tenant no banco.
 * Falha silenciosa — o convite é criado mesmo se o e-mail não for enviado.
 */
async function sendInviteEmail({ tenantId, toEmail, toName, inviterName, tenantName, role, inviteUrl, customMessage }) {
  try {
    const { rows } = await query(
      `SELECT ses_region, ses_access_key_id, ses_secret_access_key,
              ses_from_email, ses_from_name
       FROM hub_tenant_configs WHERE tenant_id = $1`,
      [tenantId]
    )

    const cfg = rows[0]
    if (!cfg?.ses_access_key_id || !cfg?.ses_from_email) {
      logger.warn(`SES não configurado para tenant=${tenantId} — convite criado sem e-mail`)
      return
    }

    const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses')
    const client = new SESClient({
      region: cfg.ses_region || 'us-east-1',
      credentials: {
        accessKeyId:     cfg.ses_access_key_id,
        secretAccessKey: cfg.ses_secret_access_key,
      },
    })

    const fromName  = cfg.ses_from_name || tenantName || 'LoteMobile HUB'
    const roleLabel = ROLE_LABELS[role] || role

    await client.send(new SendEmailCommand({
      Source: `${fromName} <${cfg.ses_from_email}>`,
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Subject: { Data: `${inviterName} convidou você para ${tenantName}`, Charset: 'UTF-8' },
        Body: {
          Html: {
            Charset: 'UTF-8',
            Data: `
              <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
                <h2 style="color:#1e3a5f;margin-bottom:4px">Você foi convidado!</h2>
                <p style="color:#64748b;font-size:14px;margin-bottom:24px">
                  <strong>${inviterName}</strong> convidou você para acessar <strong>${tenantName}</strong>
                  como <strong>${roleLabel}</strong>.
                </p>

                ${customMessage ? `<p style="color:#475569;font-size:14px;background:#f8fafc;padding:16px;border-radius:8px;border-left:4px solid #2563eb;margin-bottom:24px">${customMessage}</p>` : ''}

                <a href="${inviteUrl}"
                  style="display:inline-block;padding:14px 28px;background:#1e3a5f;color:white;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px">
                  Criar minha conta →
                </a>

                <p style="color:#94a3b8;font-size:12px;margin-top:32px">
                  Se o botão não funcionar, copie e cole este link no navegador:<br/>
                  <a href="${inviteUrl}" style="color:#2563eb;word-break:break-all">${inviteUrl}</a>
                </p>
                <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
                <p style="color:#cbd5e1;font-size:11px">
                  Este convite foi enviado por ${tenantName} via LoteMobile HUB.
                  Se você não esperava este e-mail, pode ignorá-lo.
                </p>
              </div>`,
          },
          Text: {
            Charset: 'UTF-8',
            Data: `${inviterName} convidou você para ${tenantName} como ${roleLabel}.\n\nAcesse: ${inviteUrl}`,
          },
        },
      },
    }))

    logger.info(`E-mail de convite enviado para ${toEmail} via SES`)
  } catch (err) {
    // Não quebra o fluxo — admin ainda recebe a URL para compartilhar manualmente
    logger.warn(`Falha ao enviar e-mail de convite para ${toEmail}: ${err.message}`)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLES_VALIDOS = ['admin', 'manager', 'broker', 'accountant', 'viewer', 'assistant', 'supplier', 'client', 'consultant']
const ROLE_LABELS   = {
  admin: 'Admin', manager: 'Gerente', broker: 'Corretor',
  accountant: 'Contador', viewer: 'Visualizador',
  assistant: 'Assistente', supplier: 'Fornecedor',
  client: 'Cliente', consultant: 'Consultor',
}

function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex')
}

function generateTempPassword(len = 10) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#'
  return Array.from(crypto.randomBytes(len))
    .map(b => chars[b % chars.length])
    .join('')
}

function defaultInviteMessage(inviterName, tenantName, role) {
  return `Olá! ${inviterName} convidou você para acessar o ${tenantName} como ${ROLE_LABELS[role] || role}. Use o link abaixo para configurar sua conta e começar a usar o sistema.`
}

// ── GET /users — lista usuários do tenant ────────────────────────────────────
router.get('/users', async (req, res) => {
  const { tenant_id } = req.user
  try {
    const { rows } = await query(
      `SELECT
         u.id, u.name, u.email, u.role, u.phone,
         u.avatar_url, u.is_active, u.last_login_at,
         u.must_change_password, u.invited_at,
         inv.name AS invited_by_name
       FROM hub_users u
       LEFT JOIN hub_users inv ON inv.id = u.invited_by
       WHERE u.tenant_id = $1
       ORDER BY u.is_active DESC, u.name`,
      [tenant_id]
    )
    return res.json({ ok: true, data: rows })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ── GET /users/invites — convites pendentes ───────────────────────────────────
router.get('/users/invites', async (req, res) => {
  const { tenant_id } = req.user
  try {
    const { rows } = await query(
      `SELECT
         i.*,
         u.name AS invited_by_name
       FROM hub_invites i
       JOIN hub_users u ON u.id = i.invited_by
       WHERE i.tenant_id = $1
         AND i.status = 'pending'
         AND i.expires_at > NOW()
       ORDER BY i.created_at DESC`,
      [tenant_id]
    )
    return res.json({ ok: true, data: rows })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ── POST /users/invite — cria convite ─────────────────────────────────────────
router.post('/users/invite', async (req, res) => {
  const { id: invited_by, tenant_id, name: inviter_name, role: inviter_role } = req.user

  // Apenas admin pode convidar
  if (!['admin', 'super_admin'].includes(inviter_role)) {
    return res.status(403).json({ ok: false, message: 'Apenas administradores podem convidar usuários' })
  }

  const {
    name, email, role = 'broker',
    profile_ids      = [],  // IDs de hub_profiles a vincular
    auto_activate    = true,
    use_temp_password = false,
    custom_message,    // null = usa mensagem padrão
  } = req.body

  if (!name?.trim())  return res.status(400).json({ ok: false, message: 'Nome obrigatório' })
  if (!email?.trim()) return res.status(400).json({ ok: false, message: 'E-mail obrigatório' })
  if (!ROLES_VALIDOS.includes(role)) return res.status(400).json({ ok: false, message: 'Role inválido' })

  try {
    // Verifica se e-mail já existe no tenant
    const { rows: exist } = await query(
      'SELECT id FROM hub_users WHERE LOWER(email) = LOWER($1) AND tenant_id = $2',
      [email, tenant_id]
    )
    if (exist.length) return res.status(409).json({ ok: false, message: 'Este e-mail já está cadastrado' })

    // Verifica se já há convite pendente para este e-mail
    const { rows: pendente } = await query(
      `SELECT id FROM hub_invites
       WHERE LOWER(email) = LOWER($1) AND tenant_id = $2
         AND status = 'pending' AND expires_at > NOW()`,
      [email, tenant_id]
    )
    if (pendente.length) {
      return res.status(409).json({ ok: false, message: 'Já existe um convite pendente para este e-mail' })
    }

    const token       = generateToken()
    let tempPassword  = null
    let tempPassHash  = null
    let createdUserId = null

    // Se auto_activate E usa senha temporária: cria o usuário já ativo
    if (auto_activate && use_temp_password) {
      tempPassword = generateTempPassword()
      tempPassHash = await bcrypt.hash(tempPassword, 12)

      const { rows: [newUser] } = await query(
        `INSERT INTO hub_users
           (tenant_id, name, email, password_hash, role, is_active,
            must_change_password, invited_by, invited_at)
         VALUES ($1,$2,$3,$4,$5,true,true,$6,NOW())
         RETURNING id`,
        [tenant_id, name.trim(), email.trim().toLowerCase(), tempPassHash, role, invited_by]
      )
      createdUserId = newUser.id
    }

    // Busca nome do tenant para a mensagem padrão
    const { rows: [tenant] } = await query('SELECT name FROM hub_tenants WHERE id=$1', [tenant_id])
    const mensagem = custom_message?.trim() ||
      defaultInviteMessage(inviter_name, tenant?.name || 'HUB', role)

    // Cria o convite
    const { rows: [invite] } = await query(
      `INSERT INTO hub_invites
         (tenant_id, invited_by, name, email, role,
          auto_activate, temp_password, custom_message,
          token, status, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10)
       RETURNING *`,
      [
        tenant_id, invited_by, name.trim(), email.trim().toLowerCase(), role,
        auto_activate,
        tempPassHash,   // guarda hash (nunca a senha em texto)
        mensagem,
        token,
        createdUserId || null,
      ]
    )

    // Vincula perfis ao usuário se já foi criado (auto_activate + senha temp)
    if (createdUserId && Array.isArray(profile_ids) && profile_ids.length) {
      for (const pid of profile_ids) {
        await query(
          `INSERT INTO hub_user_profiles (user_id, profile_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [createdUserId, pid]
        ).catch(() => {}) // ignora se perfil não existe
      }
    }

    // Salva profile_ids no convite para aplicar no aceite
    if (Array.isArray(profile_ids) && profile_ids.length) {
      await query(
        `UPDATE hub_invites SET profile_ids = $1 WHERE id = $2`,
        [JSON.stringify(profile_ids), invite.id]
      ).catch(() => {}) // coluna pode não existir ainda — migration cobre isso
    }

    logger.info(`Convite criado: ${email} por ${inviter_name} [${role}] perfis=${profile_ids.join(',')}`)

    const inviteUrl = `${getFrontendUrl()}/convite/${token}`

    // Envia e-mail via AWS SES (falha silenciosa)
    const { rows: [tenantInfo] } = await query('SELECT name FROM hub_tenants WHERE id=$1', [tenant_id])
    await sendInviteEmail({
      tenantId:      tenant_id,
      toEmail:       email.trim().toLowerCase(),
      toName:        name.trim(),
      inviterName:   inviter_name,
      tenantName:    tenantInfo?.name || 'HUB',
      role,
      inviteUrl,
      customMessage: mensagem,
    })

    return res.status(201).json({
      ok: true,
      data: {
        invite,
        temp_password: tempPassword,
        invite_url: inviteUrl,
      },
    })
  } catch (err) {
    logger.error('Erro ao criar convite:', err.message)
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ── DELETE /users/invite/:id — cancela convite ────────────────────────────────
router.delete('/users/invite/:id', async (req, res) => {
  const { role: inviter_role, tenant_id } = req.user
  if (!['admin', 'super_admin'].includes(inviter_role)) {
    return res.status(403).json({ ok: false, message: 'Sem permissão' })
  }
  try {
    await query(
      "UPDATE hub_invites SET status='cancelled' WHERE id=$1 AND tenant_id=$2",
      [req.params.id, tenant_id]
    )
    return res.json({ ok: true })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ── PUT /users/:id — atualiza usuário (role, active) ─────────────────────────
router.put('/users/:id', async (req, res) => {
  const { role: inviter_role, tenant_id } = req.user
  if (!['admin', 'super_admin'].includes(inviter_role)) {
    return res.status(403).json({ ok: false, message: 'Sem permissão' })
  }
  const { name, role, is_active, phone } = req.body
  try {
    const { rows: [u] } = await query(
      `UPDATE hub_users SET
         name=COALESCE($1, name),
         role=COALESCE($2, role),
         is_active=COALESCE($3, is_active),
         phone=COALESCE($4, phone),
         updated_at=NOW()
       WHERE id=$5 AND tenant_id=$6
       RETURNING id, name, email, role, is_active`,
      [name, role, is_active, phone, req.params.id, tenant_id]
    )
    if (!u) return res.status(404).json({ ok: false, message: 'Usuário não encontrado' })
    return res.json({ ok: true, data: u })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})


// ── POST /users/invite/resend/:id — recria convite cancelando o anterior ──────
router.post('/users/invite/resend/:id', async (req, res) => {
  const { id: invited_by, tenant_id, name: inviter_name, role: inviter_role } = req.user

  if (!['admin', 'super_admin'].includes(inviter_role)) {
    return res.status(403).json({ ok: false, message: 'Sem permissão' })
  }

  try {
    // Busca o convite original
    const { rows: [old] } = await query(
      `SELECT * FROM hub_invites WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenant_id]
    )
    if (!old) return res.status(404).json({ ok: false, message: 'Convite não encontrado' })

    // Cancela o antigo
    await query(
      `UPDATE hub_invites SET status='cancelled' WHERE id = $1`,
      [old.id]
    )

    // Gera novo token e convite
    const token = generateToken()
    const { rows: [tenant] } = await query('SELECT name FROM hub_tenants WHERE id=$1', [tenant_id])
    const mensagem = old.custom_message ||
      defaultInviteMessage(inviter_name, tenant?.name || 'HUB', old.role)

    const { rows: [invite] } = await query(
      `INSERT INTO hub_invites
         (tenant_id, invited_by, name, email, role,
          auto_activate, custom_message, token, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')
       RETURNING *`,
      [tenant_id, invited_by, old.name, old.email, old.role,
       old.auto_activate, mensagem, token]
    )

    logger.info(`Convite reenviado: ${old.email} por ${inviter_name}`)

    const inviteUrl = `${getFrontendUrl()}/convite/${token}`

    // Envia e-mail via AWS SES
    const { rows: [tenantInfo] } = await query('SELECT name FROM hub_tenants WHERE id=$1', [tenant_id])
    await sendInviteEmail({
      tenantId:      tenant_id,
      toEmail:       old.email,
      toName:        old.name,
      inviterName:   inviter_name,
      tenantName:    tenantInfo?.name || 'HUB',
      role:          old.role,
      inviteUrl,
      customMessage: mensagem,
    })

    return res.status(201).json({
      ok: true,
      data: {
        invite,
        invite_url: inviteUrl,
      },
    })
  } catch (err) {
    logger.error('Erro ao reenviar convite:', err.message)
    return res.status(500).json({ ok: false, message: err.message })
  }
})


module.exports = router
