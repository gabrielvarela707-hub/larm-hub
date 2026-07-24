/**
 * Lista, valida e seleciona modelos de IA disponíveis para a chave configurada.
 * Nunca reutiliza modelos Gemini descontinuados e sempre escolhe um modelo
 * realmente retornado pela API do provedor.
 */

const DEFAULT_AI_MODELS = Object.freeze({
  openai: 'gpt-4.1-mini',
  gemini: 'gemini-2.5-flash',
})

const MODEL_PREFERENCES = Object.freeze({
  openai: [
    'gpt-5-mini',
    'gpt-4.1-mini',
    'gpt-4o-mini',
    'gpt-4.1',
    'gpt-4o',
  ],
  gemini: [
    'gemini-2.5-flash',
    'gemini-flash-latest',
    'gemini-3.5-flash',
    'gemini-3-flash-preview',
    'gemini-2.0-flash',
  ],
})

const RETIRED_GEMINI_MODEL_PATTERNS = Object.freeze([
  /^gemini-1\.0(?:-|$)/i,
  /^gemini-1\.5(?:-|$)/i,
])

const MODEL_CACHE_TTL_MS = 5 * 60 * 1000
const modelCache = new Map()

function normalizeProvider(value) {
  return value === 'gemini' ? 'gemini' : 'openai'
}

function normalizeModelId(value) {
  return String(value || '').trim().replace(/^models\//i, '')
}

function isRetiredAiModel(provider, value) {
  const normalizedProvider = normalizeProvider(provider)
  const model = normalizeModelId(value)
  if (!model) return false
  if (normalizedProvider !== 'gemini') return false
  return RETIRED_GEMINI_MODEL_PATTERNS.some(pattern => pattern.test(model))
}

function sanitizeConfiguredModel(provider, value) {
  const model = normalizeModelId(value)
  return model && !isRetiredAiModel(provider, model) ? model : ''
}

function modelLabel(id, displayName) {
  const cleanDisplay = String(displayName || '').trim()
  return cleanDisplay && cleanDisplay.toLowerCase() !== String(id).toLowerCase()
    ? `${cleanDisplay} (${id})`
    : id
}

function sortModels(models, provider) {
  const preferences = MODEL_PREFERENCES[provider] || []
  const rank = new Map(preferences.map((id, index) => [id, index]))
  return [...models].sort((left, right) => {
    const leftRank = rank.has(left.id) ? rank.get(left.id) : 999
    const rightRank = rank.has(right.id) ? rank.get(right.id) : 999
    if (leftRank !== rightRank) return leftRank - rightRank
    return left.id.localeCompare(right.id)
  })
}

function chooseRecommendedModel(provider, models, configuredModel) {
  const normalizedProvider = normalizeProvider(provider)
  const availableIds = new Set(models.map(item => normalizeModelId(item.id)))
  const configured = sanitizeConfiguredModel(normalizedProvider, configuredModel)
  if (configured && availableIds.has(configured)) return configured

  for (const preferred of MODEL_PREFERENCES[normalizedProvider]) {
    if (availableIds.has(preferred)) return preferred
  }

  return models[0]?.id || DEFAULT_AI_MODELS[normalizedProvider]
}

function openAiModelIsUsable(id) {
  const model = String(id || '').toLowerCase()
  if (!model) return false
  if (!/^(gpt-|o[134](?:-|$))/.test(model)) return false
  return !/(audio|realtime|transcribe|tts|whisper|image|embedding|moderation|search|codex)/.test(model)
}

async function listOpenAIModels(apiKey) {
  const response = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(json?.error?.message || 'Não foi possível listar os modelos da OpenAI.')
  }

  const models = (Array.isArray(json?.data) ? json.data : [])
    .map(item => normalizeModelId(item?.id))
    .filter(openAiModelIsUsable)
    .map(id => ({ id, label: id, provider: 'openai' }))

  return sortModels(models, 'openai')
}

async function listGeminiModels(apiKey) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${encodeURIComponent(apiKey)}`,
  )
  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(json?.error?.message || 'Não foi possível listar os modelos do Google Gemini.')
  }

  const models = (Array.isArray(json?.models) ? json.models : [])
    .filter(item => {
      const methods = item?.supportedGenerationMethods || item?.supported_actions || []
      return methods.includes('generateContent')
    })
    .map(item => {
      const id = normalizeModelId(item?.name)
      return {
        id,
        label: modelLabel(id, item?.displayName),
        provider: 'gemini',
        description: String(item?.description || '').trim(),
      }
    })
    .filter(item => item.id
      && !isRetiredAiModel('gemini', item.id)
      && !/(embedding|aqa|imagen|veo|tts|live)/i.test(item.id))

  return sortModels(models, 'gemini')
}

async function listAiModels({ provider, apiKey, configuredModel }) {
  const normalizedProvider = normalizeProvider(provider)
  if (!apiKey) throw new Error('Informe e salve a chave da IA antes de carregar os modelos.')

  const models = normalizedProvider === 'gemini'
    ? await listGeminiModels(apiKey)
    : await listOpenAIModels(apiKey)

  if (!models.length) {
    throw new Error('Nenhum modelo compatível com geração de conteúdo foi encontrado para esta chave.')
  }

  return {
    provider: normalizedProvider,
    models,
    recommendedModel: chooseRecommendedModel(normalizedProvider, models, configuredModel),
  }
}

function cacheKeyFor(provider, apiKey) {
  const safeKey = String(apiKey || '')
  return `${normalizeProvider(provider)}:${safeKey.slice(-16)}:${safeKey.length}`
}

async function resolveAiModel({ provider, apiKey, configuredModel, forceRefresh = false }) {
  const normalizedProvider = normalizeProvider(provider)
  const safeConfiguredModel = sanitizeConfiguredModel(normalizedProvider, configuredModel)
  const key = cacheKeyFor(normalizedProvider, apiKey)
  const now = Date.now()
  const cached = modelCache.get(key)

  if (!forceRefresh && cached && now - cached.createdAt < MODEL_CACHE_TTL_MS) {
    const model = chooseRecommendedModel(normalizedProvider, cached.models, safeConfiguredModel)
    return {
      provider: normalizedProvider,
      model,
      models: cached.models,
      changed: model !== normalizeModelId(configuredModel),
    }
  }

  const listed = await listAiModels({
    provider: normalizedProvider,
    apiKey,
    configuredModel: safeConfiguredModel,
  })

  modelCache.set(key, { createdAt: now, models: listed.models })

  return {
    provider: normalizedProvider,
    model: listed.recommendedModel,
    models: listed.models,
    changed: listed.recommendedModel !== normalizeModelId(configuredModel),
  }
}

function isUnavailableModelError(status, json) {
  const message = String(json?.error?.message || '').toLowerCase()
  return status === 404
    || message.includes('not found')
    || message.includes('not supported for generatecontent')
    || message.includes('model does not exist')
    || message.includes('unsupported model')
}

module.exports = {
  DEFAULT_AI_MODELS,
  normalizeProvider,
  normalizeModelId,
  isRetiredAiModel,
  sanitizeConfiguredModel,
  chooseRecommendedModel,
  listAiModels,
  resolveAiModel,
  isUnavailableModelError,
}
