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
const { logAudit } = require('../services/auditService')
const {
  ROLES_VALIDOS,
  ROLE_LABELS,
  canManageRole,
  canSetRole,
  canInviteRole,
  getRoleFromProfileIds,
} = require('../services/permissionService')

const router = express.Router()

const PORTAL_OPTIONS = {
  santa_clara: 'Santa Clara HUB',
  larm: 'LarmHub',
}

function normalizeAllowedHubs(value) {
  let hubs = value
  if (typeof hubs === 'string') {
    try { hubs = JSON.parse(hubs) } catch { hubs = hubs.split(',') }
  }
  if (!Array.isArray(hubs)) hubs = []
  const valid = [...new Set(hubs.filter(h => PORTAL_OPTIONS[h]))]
  return valid.length ? valid : ['santa_clara']
}

function portalLabels(hubs) {
  return normalizeAllowedHubs(hubs).map(h => PORTAL_OPTIONS[h]).join(' e ')
}

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
        allowed_hubs:   normalizeAllowedHubs(invite.allowed_hubs),
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
    const allowedHubs  = normalizeAllowedHubs(invite.allowed_hubs)

    let acceptedUserId = invite.user_id

    await transaction(async (client) => {
      let userId = invite.user_id

      if (userId) {
        // Usuário já foi criado (auto_activate + senha temp) — só atualiza a senha
        await client.query(
          `UPDATE hub_users SET
             password_hash=$1,
             name=$2,
             role=$3,
             is_active=$4,
             must_change_password=false,
             allowed_hubs=$5,
             updated_at=NOW()
           WHERE id=$6`,
          [passwordHash, finalName, invite.role, invite.auto_activate, allowedHubs, userId]
        )
      } else {
        // Cria o usuário agora
        const { rows: [newUser] } = await client.query(
          `INSERT INTO hub_users
             (tenant_id, name, email, password_hash, role, is_active,
              must_change_password, invited_by, invited_at, allowed_hubs)
           VALUES ($1,$2,$3,$4,$5,$6,false,$7,NOW(),$8)
           RETURNING id`,
          [
            invite.tenant_id, finalName, invite.email, passwordHash,
            invite.role, invite.auto_activate,
            invite.invited_by, allowedHubs,
          ]
        )
        userId = newUser.id
      }
      acceptedUserId = userId

      // Marca convite como aceito
      await client.query(
        `UPDATE hub_invites
         SET status='accepted', accepted_at=NOW(), user_id=$1
         WHERE id=$2`,
        [userId, invite.id]
      )

      // Vincula perfis ao usuário recém-criado
      const profileIds = (() => {
        if (Array.isArray(invite.profile_ids)) return invite.profile_ids
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

    await logAudit({
      tenantId: invite.tenant_id,
      userId: acceptedUserId,
      action: 'invite_accept',
      module: 'usuarios',
      entityType: 'hub_invites',
      entityId: invite.id,
      targetUserId: acceptedUserId,
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'] || '',
      details: { email: invite.email, role: invite.role, allowed_hubs: allowedHubs },
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

    const fromName  = cfg.ses_from_name || tenantName || 'LarmHub'
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
                  Este convite foi enviado por ${tenantName} via LarmHub.
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


async function sendTemporaryPasswordEmail({ tenantId, toEmail, toName, tenantName, tempPassword }) {
  try {
    const { rows } = await query(
      `SELECT ses_region, ses_access_key_id, ses_secret_access_key,
              ses_from_email, ses_from_name
       FROM hub_tenant_configs WHERE tenant_id = $1`,
      [tenantId]
    )

    const cfg = rows[0]
    if (!cfg?.ses_access_key_id || !cfg?.ses_from_email) {
      logger.warn(`SES não configurado para tenant=${tenantId} — senha temporária gerada sem e-mail`)
      return false
    }

    const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses')
    const client = new SESClient({
      region: cfg.ses_region || 'us-east-1',
      credentials: {
        accessKeyId: cfg.ses_access_key_id,
        secretAccessKey: cfg.ses_secret_access_key,
      },
    })

    const fromName = cfg.ses_from_name || tenantName || 'LarmHub'

    await client.send(new SendEmailCommand({
      Source: `${fromName} <${cfg.ses_from_email}>`,
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Subject: { Data: `Senha temporária de acesso — ${tenantName || 'HUB'}`, Charset: 'UTF-8' },
        Body: {
          Html: {
            Charset: 'UTF-8',
            Data: `
              <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
                <h2 style="color:#1e3a5f;margin-bottom:4px">Sua senha foi redefinida</h2>
                <p style="color:#64748b;font-size:14px;margin-bottom:20px">
                  Olá, <strong>${toName || toEmail}</strong>. Foi gerada uma senha temporária para acessar <strong>${tenantName || 'HUB'}</strong>.
                </p>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:20px">
                  <p style="font-size:12px;color:#64748b;margin:0 0 6px">Senha temporária</p>
                  <p style="font-size:22px;letter-spacing:2px;font-weight:700;color:#0f172a;margin:0">${tempPassword}</p>
                </div>
                <p style="color:#475569;font-size:14px">
                  No próximo acesso, o sistema solicitará a troca dessa senha.
                </p>
                <p style="color:#94a3b8;font-size:12px;margin-top:28px">
                  Se você não solicitou essa alteração, fale com o administrador do sistema.
                </p>
              </div>`,
          },
          Text: {
            Charset: 'UTF-8',
            Data: `Sua senha temporária para ${tenantName || 'HUB'} é: ${tempPassword}\n\nNo próximo acesso, o sistema solicitará a troca dessa senha.`,
          },
        },
      },
    }))

    logger.info(`E-mail de senha temporária enviado para ${toEmail} via SES`)
    return true
  } catch (err) {
    logger.warn(`Falha ao enviar senha temporária para ${toEmail}: ${err.message}`)
    return false
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

async function getTargetUser(tenantId, userId) {
  const { rows: [user] } = await query(
    'SELECT id, name, email, role, is_active, allowed_hubs FROM hub_users WHERE id=$1 AND tenant_id=$2',
    [userId, tenantId]
  )
  return user || null
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
         COALESCE(u.allowed_hubs, ARRAY['santa_clara','larm']::text[]) AS allowed_hubs,
         inv.name AS invited_by_name,
         COALESCE((
           SELECT json_agg(json_build_object(
             'id', p.id,
             'name', p.name,
             'color', COALESCE(p.color, '#2563EB')
           ) ORDER BY p.name)
           FROM hub_user_profiles up
           JOIN hub_profiles p ON p.id = up.profile_id AND p.tenant_id = u.tenant_id
           WHERE up.user_id = u.id
         ), '[]'::json) AS profiles,
         COALESCE((
           SELECT array_agg(p.id::text ORDER BY p.name)
           FROM hub_user_profiles up
           JOIN hub_profiles p ON p.id = up.profile_id AND p.tenant_id = u.tenant_id
           WHERE up.user_id = u.id
         ), ARRAY[]::text[]) AS profile_ids
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

  const {
    name, email, role = 'broker',
    profile_ids      = [],  // IDs de hub_profiles a vincular
    auto_activate    = true,
    use_temp_password = false,
    custom_message,    // null = usa mensagem padrão
    allowed_hubs     = ['santa_clara'],
  } = req.body

  if (!name?.trim())  return res.status(400).json({ ok: false, message: 'Nome obrigatório' })
  if (!email?.trim()) return res.status(400).json({ ok: false, message: 'E-mail obrigatório' })
  if (!ROLES_VALIDOS.includes(role)) return res.status(400).json({ ok: false, message: 'Role inválido' })

  try {
    const normalizedAllowedHubs = normalizeAllowedHubs(allowed_hubs)
    if (!normalizedAllowedHubs.length) {
      return res.status(400).json({ ok: false, message: 'Selecione ao menos um portal de acesso' })
    }

    const finalRole = await getRoleFromProfileIds(tenant_id, profile_ids, role)
    const allowedToInvite = await canInviteRole(tenant_id, inviter_role, finalRole)
    if (!allowedToInvite) {
      return res.status(403).json({ ok: false, message: `Seu perfil não pode convidar usuários do tipo ${ROLE_LABELS[finalRole] || finalRole}` })
    }

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
            must_change_password, invited_by, invited_at, allowed_hubs)
         VALUES ($1,$2,$3,$4,$5,true,true,$6,NOW(),$7)
         RETURNING id`,
        [tenant_id, name.trim(), email.trim().toLowerCase(), tempPassHash, finalRole, invited_by, normalizedAllowedHubs]
      )
      createdUserId = newUser.id
    }

    // Busca nome do tenant para a mensagem padrão
    const { rows: [tenant] } = await query('SELECT name FROM hub_tenants WHERE id=$1', [tenant_id])
    const mensagem = custom_message?.trim() ||
      defaultInviteMessage(inviter_name, tenant?.name || 'HUB', finalRole)

    // Cria o convite
    const { rows: [invite] } = await query(
      `INSERT INTO hub_invites
         (tenant_id, invited_by, name, email, role,
          auto_activate, temp_password, custom_message,
          token, status, user_id, allowed_hubs)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11)
       RETURNING *`,
      [
        tenant_id, invited_by, name.trim(), email.trim().toLowerCase(), finalRole,
        auto_activate,
        tempPassHash,   // guarda hash (nunca a senha em texto)
        mensagem,
        token,
        createdUserId || null,
        normalizedAllowedHubs,
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

    logger.info(`Convite criado: ${email} por ${inviter_name} [${finalRole}] perfis=${profile_ids.join(',')}`)

    const inviteUrl = `${getFrontendUrl()}/convite/${token}`

    // Envia e-mail via AWS SES (falha silenciosa)
    const { rows: [tenantInfo] } = await query('SELECT name FROM hub_tenants WHERE id=$1', [tenant_id])
    await sendInviteEmail({
      tenantId:      tenant_id,
      toEmail:       email.trim().toLowerCase(),
      toName:        name.trim(),
      inviterName:   inviter_name,
      tenantName:    tenantInfo?.name || 'HUB',
      role:          finalRole,
      inviteUrl,
      customMessage: mensagem,
    })

    await logAudit({
      tenantId: tenant_id,
      userId: invited_by,
      action: 'user_invite_create',
      module: 'usuarios',
      entityType: 'hub_invites',
      entityId: invite.id,
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'] || '',
      details: { email: email.trim().toLowerCase(), role: finalRole, profile_ids },
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
  try {
    const { rows: [invite] } = await query(
      'SELECT id, role, email FROM hub_invites WHERE id=$1 AND tenant_id=$2',
      [req.params.id, tenant_id]
    )
    if (!invite) return res.status(404).json({ ok: false, message: 'Convite não encontrado' })
    const allowed = await canInviteRole(tenant_id, inviter_role, invite.role)
    if (!allowed) return res.status(403).json({ ok: false, message: 'Sem permissão' })

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
  const { id: requesterId, role: requesterRole, tenant_id } = req.user
  const { name, role, is_active, phone, allowed_hubs } = req.body

  try {
    const target = await getTargetUser(tenant_id, req.params.id)
    if (!target) return res.status(404).json({ ok: false, message: 'Usuário não encontrado' })

    if (req.params.id !== requesterId && !canManageRole(requesterRole, target.role)) {
      return res.status(403).json({ ok: false, message: 'Você não pode alterar usuário com perfil igual ou superior ao seu' })
    }

    if (role && !ROLES_VALIDOS.includes(role)) {
      return res.status(400).json({ ok: false, message: 'Role inválido' })
    }

    if (role && !canSetRole(requesterRole, role)) {
      return res.status(403).json({ ok: false, message: 'Você não pode definir um perfil igual ou superior ao seu' })
    }

    const normalizedAllowedHubs = allowed_hubs === undefined ? null : normalizeAllowedHubs(allowed_hubs)
    if (allowed_hubs !== undefined && (!normalizedAllowedHubs || normalizedAllowedHubs.length === 0)) {
      return res.status(400).json({ ok: false, message: 'Selecione ao menos um portal de acesso' })
    }

    const { rows: [u] } = await query(
      `UPDATE hub_users SET
         name=COALESCE($1, name),
         role=COALESCE($2, role),
         is_active=COALESCE($3, is_active),
         phone=COALESCE($4, phone),
         allowed_hubs=COALESCE($5, allowed_hubs),
         updated_at=NOW()
       WHERE id=$6 AND tenant_id=$7
       RETURNING id, name, email, role, is_active, allowed_hubs`,
      [name, role, is_active, phone, normalizedAllowedHubs, req.params.id, tenant_id]
    )

    await logAudit({
      tenantId: tenant_id,
      userId: requesterId,
      action: 'user_update',
      module: 'usuarios',
      entityType: 'hub_users',
      entityId: u.id,
      targetUserId: u.id,
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'] || '',
      details: { before_role: target.role, after_role: u.role, changed: { name, role, is_active, phone, allowed_hubs: normalizedAllowedHubs } },
    })

    return res.json({ ok: true, data: u })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})


// ── POST /users/invite/resend/:id — recria convite cancelando o anterior ──────
router.post('/users/invite/resend/:id', async (req, res) => {
  const { id: invited_by, tenant_id, name: inviter_name, role: inviter_role } = req.user

  try {
    // Busca o convite original
    const { rows: [old] } = await query(
      `SELECT * FROM hub_invites WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenant_id]
    )
    if (!old) return res.status(404).json({ ok: false, message: 'Convite não encontrado' })
    const allowedToResend = await canInviteRole(tenant_id, inviter_role, old.role)
    if (!allowedToResend) return res.status(403).json({ ok: false, message: 'Sem permissão para reenviar este convite' })

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
          auto_activate, custom_message, token, status, profile_ids, user_id, allowed_hubs)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10,$11)
       RETURNING *`,
      [tenant_id, invited_by, old.name, old.email, old.role,
       old.auto_activate, mensagem, token, JSON.stringify(old.profile_ids || []), old.user_id || null, normalizeAllowedHubs(old.allowed_hubs)]
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


// ── POST /users/:id/resend-invite — reenvia convite para usuário existente ─────
router.post('/users/:id/resend-invite', async (req, res) => {
  const { id: invited_by, tenant_id, name: inviter_name, role: inviter_role } = req.user

  try {
    const { rows: [user] } = await query(
      `SELECT id, name, email, role, is_active, allowed_hubs
         FROM hub_users
        WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenant_id]
    )
    if (!user) return res.status(404).json({ ok: false, message: 'Usuário não encontrado' })
    if (!canManageRole(inviter_role, user.role)) {
      return res.status(403).json({ ok: false, message: 'Você não pode reenviar convite para usuário com perfil igual ou superior ao seu' })
    }

    const { rows: profileRows } = await query(
      `SELECT up.profile_id::text AS profile_id
         FROM hub_user_profiles up
         JOIN hub_profiles p ON p.id = up.profile_id AND p.tenant_id = $2
        WHERE up.user_id = $1`,
      [user.id, tenant_id]
    )
    const profileIds = profileRows.map(r => r.profile_id)

    await query(
      `UPDATE hub_invites
          SET status='cancelled'
        WHERE tenant_id=$1
          AND LOWER(email)=LOWER($2)
          AND status='pending'`,
      [tenant_id, user.email]
    )

    const token = generateToken()
    const { rows: [tenant] } = await query('SELECT name FROM hub_tenants WHERE id=$1', [tenant_id])
    const mensagem = defaultInviteMessage(inviter_name, tenant?.name || 'HUB', user.role)

    const { rows: [invite] } = await query(
      `INSERT INTO hub_invites
         (tenant_id, invited_by, name, email, role,
          auto_activate, custom_message, token, status, user_id, profile_ids, allowed_hubs)
       VALUES ($1,$2,$3,$4,$5,true,$6,$7,'pending',$8,$9,$10)
       RETURNING *`,
      [tenant_id, invited_by, user.name, user.email, user.role, mensagem, token, user.id, JSON.stringify(profileIds), normalizeAllowedHubs(user.allowed_hubs)]
    )

    const inviteUrl = `${getFrontendUrl()}/convite/${token}`
    await sendInviteEmail({
      tenantId:      tenant_id,
      toEmail:       user.email,
      toName:        user.name,
      inviterName:   inviter_name,
      tenantName:    tenant?.name || 'HUB',
      role:          user.role,
      inviteUrl,
      customMessage: mensagem,
    })

    logger.info(`Convite reenviado para usuário existente: ${user.email} por ${inviter_name}`)
    return res.status(201).json({ ok: true, data: { invite, invite_url: inviteUrl } })
  } catch (err) {
    logger.error('Erro ao reenviar convite para usuário:', err.message)
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ── POST /users/:id/reset-password — gera senha temporária ─────────────────────
router.post('/users/:id/reset-password', async (req, res) => {
  const { tenant_id, role: requesterRole } = req.user

  try {
    const target = await getTargetUser(tenant_id, req.params.id)
    if (!target) return res.status(404).json({ ok: false, message: 'Usuário não encontrado' })
    if (!canManageRole(requesterRole, target.role)) {
      return res.status(403).json({ ok: false, message: 'Você não pode resetar senha de usuário com perfil igual ou superior ao seu' })
    }

    const tempPassword = generateTempPassword()
    const passwordHash = await bcrypt.hash(tempPassword, 12)

    const { rows: [user] } = await query(
      `UPDATE hub_users
          SET password_hash=$1,
              must_change_password=true,
              is_active=true,
              updated_at=NOW()
        WHERE id=$2 AND tenant_id=$3
        RETURNING id, name, email, role, is_active`,
      [passwordHash, req.params.id, tenant_id]
    )

    if (!user) return res.status(404).json({ ok: false, message: 'Usuário não encontrado' })

    const { rows: [tenant] } = await query('SELECT name FROM hub_tenants WHERE id=$1', [tenant_id])
    const emailSent = await sendTemporaryPasswordEmail({
      tenantId: tenant_id,
      toEmail: user.email,
      toName: user.name,
      tenantName: tenant?.name || 'HUB',
      tempPassword,
    })

    logger.info(`Senha temporária gerada para ${user.email}`)
    await logAudit({
      tenantId: tenant_id,
      userId: req.user.id,
      action: 'user_password_reset',
      module: 'usuarios',
      entityType: 'hub_users',
      entityId: user.id,
      targetUserId: user.id,
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'] || '',
      details: { email: user.email, email_sent: emailSent },
    })
    return res.json({ ok: true, data: { user, temp_password: tempPassword, email_sent: emailSent } })
  } catch (err) {
    logger.error('Erro ao resetar senha:', err.message)
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ── DELETE /users/:id — inativa usuário sem apagar histórico ───────────────────
router.delete('/users/:id', async (req, res) => {
  const { id: requesterId, tenant_id, role: requesterRole } = req.user

  if (req.params.id === requesterId) {
    return res.status(400).json({ ok: false, message: 'Você não pode inativar seu próprio usuário' })
  }

  try {
    const target = await getTargetUser(tenant_id, req.params.id)
    if (!target) return res.status(404).json({ ok: false, message: 'Usuário não encontrado' })
    if (!canManageRole(requesterRole, target.role)) {
      return res.status(403).json({ ok: false, message: 'Você não pode inativar usuário com perfil igual ou superior ao seu' })
    }

    const { rows: [user] } = await query(
      `UPDATE hub_users
          SET is_active=false,
              updated_at=NOW()
        WHERE id=$1 AND tenant_id=$2
        RETURNING id, name, email, role, is_active`,
      [req.params.id, tenant_id]
    )

    if (!user) return res.status(404).json({ ok: false, message: 'Usuário não encontrado' })

    logger.info(`Usuário inativado: ${user.email}`)
    await logAudit({
      tenantId: tenant_id,
      userId: requesterId,
      action: 'user_deactivate',
      module: 'usuarios',
      entityType: 'hub_users',
      entityId: user.id,
      targetUserId: user.id,
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'] || '',
      details: { email: user.email, previous_role: target.role },
    })
    return res.json({ ok: true, data: user })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})


module.exports = router
