/**
 * Canonical IPC channel names.
 *
 * This module is intentionally dependency-free (no `zod`, no Node, no Electron)
 * so it can be imported from all three runtimes: the sandboxed preload, the
 * Electron main process, and unit tests. Raw channel strings must never appear
 * anywhere else — every `ipcMain.handle`, `ipcRenderer.invoke`, and
 * `webContents.send` call resolves its channel through this table so the two
 * sides can never drift (`INV-IPC`).
 */

/** Request/response channels (`ipcMain.handle` ⇄ `ipcRenderer.invoke`). */
export const CH = {
  // Settings
  settingsLoad: 'settings:load',
  settingsSave: 'settings:save',
  settingsPickDirectory: 'settings:pickDirectory',

  // Secrets (write-only; reads return status/metadata, never key values)
  secretsLoad: 'secrets:load',
  secretsSave: 'secrets:save',
  secretsRecheck: 'secrets:recheck',
  secretsDevEnvVarNames: 'secrets:devEnvVarNames',

  // Threads
  threadsLoad: 'threads:load',
  threadsSave: 'threads:save',
  threadsRepairRedundant: 'threads:repairRedundant',
  threadsDeletePreview: 'threads:deletePreview',
  threadsDeleteApply: 'threads:deleteApply',

  // QA pairs
  qaListAll: 'qa:listAll',
  qaGet: 'qa:get',
  qaCreate: 'qa:create',
  qaUpdate: 'qa:update',
  qaDelete: 'qa:delete',

  // Search
  searchQuery: 'search:query',
  searchSemantic: 'search:semantic',

  // AI / LLM
  aiGenerateMetadata: 'ai:generateMetadata',
  aiGenerateEmbedding: 'ai:generateEmbedding',
  aiGenerateAllEmbeddings: 'ai:generateAllEmbeddings',
  aiTestConnection: 'ai:testConnection',
  aiListProviders: 'ai:listProviders',
  aiListModels: 'ai:listModels',
  aiSessionBrief: 'ai:sessionBrief',
  aiPriorArt: 'ai:priorArt',
  aiSteelman: 'ai:steelman',
  aiQuestionSeed: 'ai:questionSeed',
  aiConceptSummary: 'ai:conceptSummary',
  aiGetTokenStats: 'ai:getTokenStats',
  aiResetTokenStats: 'ai:resetTokenStats',
  aiGenerateAnnotations: 'ai:generateAnnotations',
  aiApplyAnnotations: 'ai:applyAnnotations',

  // Archive health / maintenance
  archiveHealthCheck: 'archive:healthCheck',
  archiveResetPreview: 'archive:resetPreview',
  archiveReset: 'archive:reset',

  // Tag dictionary
  tagsLoad: 'tags:load',
  tagsSave: 'tags:save',
  tagsAdd: 'tags:add',
  tagsRemove: 'tags:remove',
  tagsRename: 'tags:rename',
  tagsAddAlias: 'tags:addAlias',
  tagsRemoveAlias: 'tags:removeAlias',
  tagsResolve: 'tags:resolve',
  tagsSync: 'tags:sync',

  // Export / import
  exportQa: 'export:qa',
  exportThread: 'export:thread',
  importFile: 'import:file',
  importSharedLink: 'import:sharedLink',
  importArchiveCommit: 'import:archiveCommit',
  importArchiveCancel: 'import:archiveCancel',

  // Duplicate cleanup
  duplicatesScan: 'duplicates:scan',
  duplicatesDelete: 'duplicates:delete',

  // Shell
  openExternal: 'openExternal',
} as const

/** Main → renderer push channels (`webContents.send` ⇄ `ipcRenderer.on`). */
export const EVENT_CH = {
  menuAction: 'menu-action',
  archiveImportProgress: 'archive-import:progress',
} as const

export type ChannelKey = keyof typeof CH
export type Channel = (typeof CH)[ChannelKey]
export type EventChannelKey = keyof typeof EVENT_CH
export type EventChannel = (typeof EVENT_CH)[EventChannelKey]

/** Every request/response channel string, for parity/registration checks. */
export const ALL_CHANNELS: readonly Channel[] = Object.freeze(
  Object.values(CH) as Channel[],
)
