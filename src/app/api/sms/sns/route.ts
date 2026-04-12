import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

type SmsType = 'Transactional' | 'Promotional'

type SnsRuntimeConfig = {
  snsRegion?: string
  snsAccessKeyId?: string
  snsSecretAccessKey?: string
  snsSenderId?: string
  snsSMSType?: SmsType
  snsMockMode?: boolean
}

type SmsSendRequest = {
  phoneNumbers?: string[]
  message?: string
  config?: SnsRuntimeConfig
  dryRun?: boolean
}

type PublishResult = {
  phoneNumber: string
  success: boolean
  messageId?: string
  requestId?: string
  error?: string
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex')
}

function hmac(key: Buffer | string, value: string): Buffer {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest()
}

function normalizePhoneNumber(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, '')

  if (!digits) return ''
  if (digits.startsWith('55') && digits.length >= 12) return `+${digits}`
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`
  return digits.startsWith('+') ? digits : `+${digits}`
}

function encodeFormValue(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

function buildPublishBody(phoneNumber: string, message: string, config: Required<Pick<SnsRuntimeConfig, 'snsSenderId' | 'snsSMSType'>>): string {
  const parts: string[] = [
    `Action=${encodeFormValue('Publish')}`,
    `Version=${encodeFormValue('2010-03-31')}`,
    `PhoneNumber=${encodeFormValue(phoneNumber)}`,
    `Message=${encodeFormValue(message)}`,
  ]

  if (config.snsSMSType) {
    parts.push(`MessageAttributes.entry.1.Name=${encodeFormValue('AWS.SNS.SMS.SMSType')}`)
    parts.push(`MessageAttributes.entry.1.Value.DataType=${encodeFormValue('String')}`)
    parts.push(`MessageAttributes.entry.1.Value.StringValue=${encodeFormValue(config.snsSMSType)}`)
  }

  if (config.snsSenderId) {
    parts.push(`MessageAttributes.entry.2.Name=${encodeFormValue('AWS.SNS.SMS.SenderID')}`)
    parts.push(`MessageAttributes.entry.2.Value.DataType=${encodeFormValue('String')}`)
    parts.push(`MessageAttributes.entry.2.Value.StringValue=${encodeFormValue(config.snsSenderId)}`)
  }

  return parts.join('&')
}

function buildAuthorizationHeader(body: string, region: string, accessKeyId: string, secretAccessKey: string): { authorization: string; amzDate: string } {
  const now = new Date()
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const amzDate = iso.slice(0, 15) + 'Z'
  const dateStamp = amzDate.slice(0, 8)
  const service = 'sns'
  const host = `sns.${region}.amazonaws.com`

  const canonicalRequest = [
    'POST',
    '/',
    '',
    `content-type:application/x-www-form-urlencoded; charset=utf-8\nhost:${host}\nx-amz-date:${amzDate}\n`,
    'content-type;host;x-amz-date',
    sha256(body),
  ].join('\n')

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n')

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp)
  const kRegion = hmac(kDate, region)
  const kService = hmac(kRegion, service)
  const kSigning = hmac(kService, 'aws4_request')
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex')

  return {
    amzDate,
    authorization: [
      'AWS4-HMAC-SHA256',
      `Credential=${accessKeyId}/${credentialScope},`,
      'SignedHeaders=content-type;host;x-amz-date,',
      `Signature=${signature}`,
    ].join(' '),
  }
}

function parseXmlTag(xml: string, tagName: string): string {
  const match = xml.match(new RegExp(`<${tagName}>(.*?)</${tagName}>`))
  return match?.[1]?.trim() ?? ''
}

async function publishSms(phoneNumber: string, message: string, config: Required<Pick<SnsRuntimeConfig, 'snsRegion' | 'snsAccessKeyId' | 'snsSecretAccessKey'>> & Pick<SnsRuntimeConfig, 'snsSenderId' | 'snsSMSType'>): Promise<PublishResult> {
  const body = buildPublishBody(phoneNumber, message, {
    snsSenderId: (config.snsSenderId ?? '').trim(),
    snsSMSType: config.snsSMSType ?? 'Transactional',
  })
  const host = `sns.${config.snsRegion}.amazonaws.com`
  const endpoint = `https://${host}/`
  const { authorization, amzDate } = buildAuthorizationHeader(body, config.snsRegion, config.snsAccessKeyId, config.snsSecretAccessKey)

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      'X-Amz-Date': amzDate,
      Authorization: authorization,
    },
    body,
    cache: 'no-store',
  })

  const xml = await response.text()

  if (!response.ok) {
    return {
      phoneNumber,
      success: false,
      error: parseXmlTag(xml, 'Message') || 'Falha ao publicar o SMS no AWS SNS.',
      requestId: parseXmlTag(xml, 'RequestId'),
    }
  }

  return {
    phoneNumber,
    success: true,
    messageId: parseXmlTag(xml, 'MessageId'),
    requestId: parseXmlTag(xml, 'RequestId'),
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SmsSendRequest
    const message = (body.message ?? '').trim()
    const config = body.config ?? {}
    const normalizedNumbers = Array.from(new Set((body.phoneNumbers ?? []).map(normalizePhoneNumber).filter(Boolean)))
    const dryRun = Boolean(body.dryRun ?? config.snsMockMode)

    if (!message) {
      return NextResponse.json({ ok: false, error: 'Informe a mensagem do SMS.' }, { status: 400 })
    }

    if (normalizedNumbers.length === 0) {
      return NextResponse.json({ ok: false, error: 'Selecione ao menos um telefone para envio.' }, { status: 400 })
    }

    if (dryRun) {
      const sentAt = new Date().toISOString()
      return NextResponse.json({
        ok: true,
        mode: 'mock',
        sentAt,
        results: normalizedNumbers.map((phoneNumber, index) => ({
          phoneNumber,
          success: true,
          messageId: `mock-sns-${index + 1}-${Date.now()}`,
        })),
      })
    }

    if (!config.snsAccessKeyId || !config.snsSecretAccessKey || !config.snsRegion) {
      return NextResponse.json({ ok: false, error: 'Preencha as credenciais do AWS SNS em Configuracoes antes do envio real.' }, { status: 400 })
    }

    const results: PublishResult[] = []
    for (const phoneNumber of normalizedNumbers) {
      const result = await publishSms(phoneNumber, message, {
        snsRegion: config.snsRegion,
        snsAccessKeyId: config.snsAccessKeyId,
        snsSecretAccessKey: config.snsSecretAccessKey,
        snsSenderId: config.snsSenderId,
        snsSMSType: config.snsSMSType,
      })
      results.push(result)
    }

    const successCount = results.filter((item) => item.success).length

    return NextResponse.json(
      {
        ok: successCount > 0,
        mode: 'live',
        results,
        sentAt: new Date().toISOString(),
      },
      { status: successCount === results.length ? 200 : successCount > 0 ? 207 : 400 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado ao preparar o envio do SMS.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
