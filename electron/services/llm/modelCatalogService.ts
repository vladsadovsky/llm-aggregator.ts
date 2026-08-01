import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import OpenAI from 'openai'
import type { AppSecrets } from '../secretsService'
import { debugError, debugLog } from '../logger'
import { getProviderDescriptor, listProviderDescriptors } from './providerRegistry'
import { atomicWriteJsonSync } from '../persistence/atomicFile'

export type ModelTier = 'budget' | 'balanced' | 'premium' | 'unknown'
export type LatencyTier = 'fast' | 'medium' | 'slow' | 'unknown'

export interface ModelDescriptor {
  id: string
  label: string
  providerId: string
  qualityTier: ModelTier
  costTier: ModelTier
  latencyTier: LatencyTier
  recommendedFor: string[]
  notes?: string
  rank?: number
}

export interface ModelCatalogResult {
  providerId: string
  source: 'api' | 'cache' | 'static'
  fetchedAt: string
  warning?: string
  models: ModelDescriptor[]
}

interface ModelHint {
  label: string
  qualityTier: ModelTier
  costTier: ModelTier
  latencyTier: LatencyTier
  recommendedFor: string[]
  notes?: string
  rank?: number
}

interface CatalogCache {
  [providerId: string]: ModelCatalogResult
}

export interface ModelCatalogOptions {
  /**
   * A key the user has typed in Settings but not yet saved, scoped to the
   * provider being queried. Lets model discovery work before Save without the
   * renderer having to hold or resend stored keys.
   */
  apiKeyOverride?: string
}

const CATALOG_CACHE_FILENAME = 'model-catalog-cache.json'

const OPENAI_HINTS: Record<string, ModelHint> = {
  'gpt-5.6-sol': {
    label: 'GPT-5.6 Sol',
    qualityTier: 'premium',
    costTier: 'premium',
    latencyTier: 'slow',
    recommendedFor: ['best quality', 'complex reasoning', 'hard coding tasks'],
    notes: 'Flagship quality with highest cost.',
    rank: 1,
  },
  'gpt-5.6-terra': {
    label: 'GPT-5.6 Terra',
    qualityTier: 'balanced',
    costTier: 'balanced',
    latencyTier: 'medium',
    recommendedFor: ['balanced default', 'general analysis'],
    notes: 'Balanced quality and cost.',
    rank: 2,
  },
  'gpt-5.6-luna': {
    label: 'GPT-5.6 Luna',
    qualityTier: 'balanced',
    costTier: 'budget',
    latencyTier: 'fast',
    recommendedFor: ['cost-sensitive bulk work', 'high throughput'],
    notes: 'Lower cost for high-volume workloads.',
    rank: 3,
  },
  'gpt-4o': {
    label: 'GPT-4o',
    qualityTier: 'balanced',
    costTier: 'balanced',
    latencyTier: 'medium',
    recommendedFor: ['stable general-purpose use'],
    rank: 20,
  },
  'gpt-4o-mini': {
    label: 'GPT-4o mini',
    qualityTier: 'budget',
    costTier: 'budget',
    latencyTier: 'fast',
    recommendedFor: ['cheap utility tasks', 'drafting'],
    rank: 21,
  },
  'o4-mini': {
    label: 'o4-mini',
    qualityTier: 'balanced',
    costTier: 'budget',
    latencyTier: 'fast',
    recommendedFor: ['faster reasoning'],
    rank: 22,
  },
  'o3-mini': {
    label: 'o3-mini',
    qualityTier: 'balanced',
    costTier: 'budget',
    latencyTier: 'medium',
    recommendedFor: ['reasoning on a budget'],
    rank: 23,
  },
}

const ANTHROPIC_STATIC: ModelDescriptor[] = [
  {
    id: 'claude-opus-5',
    label: 'Claude Opus 5',
    providerId: 'anthropic',
    qualityTier: 'premium',
    costTier: 'premium',
    latencyTier: 'medium',
    recommendedFor: ['maximum Claude quality'],
  },
  {
    id: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    providerId: 'anthropic',
    qualityTier: 'balanced',
    costTier: 'balanced',
    latencyTier: 'fast',
    recommendedFor: ['balanced quality and speed'],
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    providerId: 'anthropic',
    qualityTier: 'budget',
    costTier: 'budget',
    latencyTier: 'fast',
    recommendedFor: ['low latency and lower cost'],
  },
]

const ANTHROPIC_HINTS: Record<string, ModelHint> = {
  'claude-opus-5': {
    label: 'Claude Opus 5',
    qualityTier: 'premium',
    costTier: 'premium',
    latencyTier: 'medium',
    recommendedFor: ['highest Claude quality', 'complex analysis'],
    notes: 'Highest Claude capability tier.',
    rank: 10,
  },
  'claude-sonnet-5': {
    label: 'Claude Sonnet 5',
    qualityTier: 'balanced',
    costTier: 'balanced',
    latencyTier: 'fast',
    recommendedFor: ['balanced default', 'daily usage'],
    notes: 'Good quality/speed balance for most work.',
    rank: 11,
  },
  'claude-haiku-4-5': {
    label: 'Claude Haiku 4.5',
    qualityTier: 'budget',
    costTier: 'budget',
    latencyTier: 'fast',
    recommendedFor: ['low-latency drafts', 'cost-sensitive flows'],
    notes: 'Fastest, lower-cost Claude family model.',
    rank: 12,
  },
}

function getCatalogCachePath(): string {
  return join(app.getPath('userData'), CATALOG_CACHE_FILENAME)
}

function loadCatalogCache(): CatalogCache {
  const cachePath = getCatalogCachePath()
  if (!existsSync(cachePath)) {
    return {}
  }

  try {
    const raw = readFileSync(cachePath, 'utf-8')
    return JSON.parse(raw) as CatalogCache
  } catch (err) {
    debugError('modelCatalogService', 'Failed to load model catalog cache:', err)
    return {}
  }
}

/**
 * Best-effort cache write. A failure here must not surface as "model list
 * unavailable" when the API call itself succeeded, so it is logged and swallowed.
 */
function saveCatalogCache(cache: CatalogCache): void {
  try {
    atomicWriteJsonSync(getCatalogCachePath(), cache)
  } catch (err) {
    debugError('modelCatalogService', 'Failed to persist model catalog cache:', err)
  }
}

function makeOpenAIStaticCatalog(): ModelCatalogResult {
  const models = Object.entries(OPENAI_HINTS)
    .map(([id, hint]) => ({
      id,
      label: hint.label,
      providerId: 'openai',
      qualityTier: hint.qualityTier,
      costTier: hint.costTier,
      latencyTier: hint.latencyTier,
      recommendedFor: [...hint.recommendedFor],
      notes: hint.notes,
      rank: hint.rank,
    }))
    .sort(sortModels)

  return {
    providerId: 'openai',
    source: 'static',
    fetchedAt: new Date().toISOString(),
    models,
  }
}

function modelLooksLikeTextCompletionModel(modelId: string): boolean {
  const id = modelId.toLowerCase()
  if (id.includes('embedding')) return false
  if (id.includes('realtime')) return false
  if (id.includes('audio')) return false
  if (id.includes('image')) return false
  if (id.includes('transcribe')) return false
  return id.startsWith('gpt-') || id.startsWith('o') || OPENAI_HINTS[id] !== undefined
}

function hintForOpenAIModel(modelId: string): ModelHint {
  return OPENAI_HINTS[modelId] ?? {
    label: modelId,
    qualityTier: 'unknown',
    costTier: 'unknown',
    latencyTier: 'unknown',
    recommendedFor: ['not yet profiled'],
    notes: 'New or unprofiled model. Validate quality/cost with your workload.',
  }
}

function hintForAnthropicModel(modelId: string, displayName?: string): ModelHint {
  const mapped = ANTHROPIC_HINTS[modelId]
  if (mapped) {
    return mapped
  }
  return {
    label: displayName || modelId,
    qualityTier: 'unknown',
    costTier: 'unknown',
    latencyTier: 'unknown',
    recommendedFor: ['not yet profiled'],
    notes: 'New or unprofiled model. Validate quality/cost with your workload.',
  }
}

function sortModels(a: ModelDescriptor, b: ModelDescriptor): number {
  const rankA = a.rank ?? Number.MAX_SAFE_INTEGER
  const rankB = b.rank ?? Number.MAX_SAFE_INTEGER
  if (rankA !== rankB) {
    return rankA - rankB
  }
  return a.label.localeCompare(b.label)
}

async function fetchOpenAIModels(apiKey: string): Promise<ModelCatalogResult> {
  const client = new OpenAI({ apiKey })
  const response = await client.models.list()
  const dedup = new Map<string, ModelDescriptor>()

  for (const model of response.data) {
    const modelId = model.id
    if (!modelLooksLikeTextCompletionModel(modelId)) {
      continue
    }

    const hint = hintForOpenAIModel(modelId)
    dedup.set(modelId, {
      id: modelId,
      label: hint.label || modelId,
      providerId: 'openai',
      qualityTier: hint.qualityTier,
      costTier: hint.costTier,
      latencyTier: hint.latencyTier,
      recommendedFor: [...hint.recommendedFor],
      notes: hint.notes,
      rank: hint.rank,
    })
  }

  // Keep curated models visible even if account listing is limited.
  for (const [modelId, hint] of Object.entries(OPENAI_HINTS)) {
    if (dedup.has(modelId)) {
      continue
    }
    dedup.set(modelId, {
      id: modelId,
      label: hint.label,
      providerId: 'openai',
      qualityTier: hint.qualityTier,
      costTier: hint.costTier,
      latencyTier: hint.latencyTier,
      recommendedFor: [...hint.recommendedFor],
      notes: `${hint.notes ?? 'Curated fallback model.'} Not confirmed in your current account list.`,
      rank: hint.rank,
    })
  }

  const models = Array.from(dedup.values()).sort(sortModels)
  return {
    providerId: 'openai',
    source: 'api',
    fetchedAt: new Date().toISOString(),
    models,
  }
}

interface AnthropicModelsResponse {
  data?: Array<{
    id: string
    display_name?: string
  }>
}

async function fetchAnthropicModels(apiKey: string): Promise<ModelCatalogResult> {
  const response = await fetch('https://api.anthropic.com/v1/models?limit=1000', {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  })

  if (!response.ok) {
    let details = ''
    try {
      details = await response.text()
    } catch {
      details = ''
    }
    const suffix = details ? ` ${details}` : ''
    throw new Error(`Anthropic model list request failed (${response.status}).${suffix}`)
  }

  const payload = (await response.json()) as AnthropicModelsResponse
  const dedup = new Map<string, ModelDescriptor>()

  for (const model of payload.data ?? []) {
    const modelId = model.id
    if (!modelId) {
      continue
    }
    const hint = hintForAnthropicModel(modelId, model.display_name)
    dedup.set(modelId, {
      id: modelId,
      label: hint.label || model.display_name || modelId,
      providerId: 'anthropic',
      qualityTier: hint.qualityTier,
      costTier: hint.costTier,
      latencyTier: hint.latencyTier,
      recommendedFor: [...hint.recommendedFor],
      notes: hint.notes,
      rank: hint.rank,
    })
  }

  for (const [modelId, hint] of Object.entries(ANTHROPIC_HINTS)) {
    if (dedup.has(modelId)) {
      continue
    }
    dedup.set(modelId, {
      id: modelId,
      label: hint.label,
      providerId: 'anthropic',
      qualityTier: hint.qualityTier,
      costTier: hint.costTier,
      latencyTier: hint.latencyTier,
      recommendedFor: [...hint.recommendedFor],
      notes: `${hint.notes ?? 'Curated fallback model.'} Not confirmed in your current account list.`,
      rank: hint.rank,
    })
  }

  const models = Array.from(dedup.values()).sort(sortModels)
  return {
    providerId: 'anthropic',
    source: 'api',
    fetchedAt: new Date().toISOString(),
    warning: 'Anthropic does not currently provide embeddings via this app provider path. Use OpenAI provider for embedding generation and semantic indexing.',
    models,
  }
}

export function listLlmProviders() {
  return listProviderDescriptors()
}

export async function listProviderModels(
  providerId: string,
  secrets: AppSecrets,
  forceRefresh = false,
  options: ModelCatalogOptions = {},
): Promise<ModelCatalogResult> {
  const provider = getProviderDescriptor(providerId)
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`)
  }

  const cache = loadCatalogCache()

  if (!forceRefresh && cache[providerId]) {
    return cache[providerId]
  }

  if (providerId === 'openai') {
    const openaiApiKey = (options.apiKeyOverride ?? secrets.openaiApiKey ?? '').trim()
    if (!openaiApiKey) {
      const fallback = cache[providerId] ?? makeOpenAIStaticCatalog()
      return {
        ...fallback,
        source: fallback.source === 'api' ? 'cache' : fallback.source,
        warning: 'OpenAI API key is missing; showing cached/static catalog.',
      }
    }

    try {
      const result = await fetchOpenAIModels(openaiApiKey)
      cache[providerId] = result
      saveCatalogCache(cache)
      return result
    } catch (err) {
      debugError('modelCatalogService', 'OpenAI model list fetch failed:', err)
      const cached = cache[providerId]
      if (cached) {
        return {
          ...cached,
          source: 'cache',
          warning: `Model API fetch failed; showing cached catalog. ${(err as Error).message}`,
        }
      }
      const fallback = makeOpenAIStaticCatalog()
      return {
        ...fallback,
        warning: `Model API fetch failed; showing static catalog. ${(err as Error).message}`,
      }
    }
  }

  if (providerId === 'anthropic') {
    const anthropicApiKey = (options.apiKeyOverride ?? secrets.anthropicApiKey ?? '').trim()
    if (!anthropicApiKey) {
      const fallback = cache[providerId] ?? {
        providerId,
        source: 'static' as const,
        fetchedAt: new Date().toISOString(),
        models: ANTHROPIC_STATIC,
      }
      return {
        ...fallback,
        source: fallback.source === 'api' ? 'cache' : fallback.source,
        warning: 'Anthropic API key is missing; showing cached/static catalog. Anthropic embeddings are not available in this provider path.',
      }
    }

    try {
      const result = await fetchAnthropicModels(anthropicApiKey)
      cache[providerId] = result
      saveCatalogCache(cache)
      return result
    } catch (err) {
      debugError('modelCatalogService', 'Anthropic model list fetch failed:', err)
      const cached = cache[providerId]
      if (cached) {
        return {
          ...cached,
          source: 'cache',
          warning: `Model API fetch failed; showing cached catalog. ${(err as Error).message}`,
        }
      }
      return {
        providerId,
        source: 'static',
        fetchedAt: new Date().toISOString(),
        warning: `Model API fetch failed; showing static catalog. ${(err as Error).message}`,
        models: ANTHROPIC_STATIC,
      }
    }
  }

  // Providers with no discovery implementation (e.g. future openai-compatible
  // gateways). The openai/anthropic branches above have already returned.
  const staticResult: ModelCatalogResult = {
    providerId,
    source: 'static',
    fetchedAt: new Date().toISOString(),
    warning: provider.notes,
    models: [],
  }
  cache[providerId] = staticResult
  saveCatalogCache(cache)
  debugLog('modelCatalogService', `Returning static model catalog for provider "${providerId}".`)
  return staticResult
}
