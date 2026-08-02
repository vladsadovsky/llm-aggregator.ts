/**
 * IPC contract barrel + the canonical channel → argument-schema registry.
 *
 * `channelArgs` is the single source of truth for argument validation. The
 * `satisfies Record<Channel, ...>` clause is the compile-time parity guard: the
 * build fails if a channel is added to `CH` without a schema here, or if a
 * schema names a channel that does not exist.
 *
 * Main-side only — pulls in `zod`. The preload imports `./channels` alone.
 */
import { z } from 'zod'
import { CH, type Channel } from './channels'
import {
  boundedString,
  boundedInt,
  EntityId,
  UrlString,
  TagName,
} from './common'
import { AppSettingsSchema, SecretsUpdateSchema } from './settings'
import {
  QaCreateSchema,
  QaUpdateSchema,
  ThreadMapSchema,
  SearchTypeSchema,
  DuplicateCleanupRequestSchema,
  RedundantThreadRepairRequestSchema,
  ThreadDeletionIdsSchema,
  ThreadDeletionTokenSchema,
} from './archive'
import {
  BulkImportSelectionSchema,
  PreviewIdSchema,
  SharedLinkUrlSchema,
} from './import'
import {
  ListModelsArgs,
  InsightTextSchema,
  AnnotationIdsSchema,
  ApplyAnnotationsSchema,
} from './llm'
import { TagDictionarySchema, AliasesSchema } from './tags'

export * from './channels'
export * from './common'
export * from './settings'
export * from './archive'
export * from './import'
export * from './llm'
export * from './tags'

const noArgs = z.tuple([])

/** Canonical per-channel argument-tuple schemas. */
export const channelArgs = {
  // Settings
  [CH.settingsLoad]: noArgs,
  [CH.settingsSave]: z.tuple([AppSettingsSchema]),
  [CH.settingsPickDirectory]: noArgs,

  // Secrets
  [CH.secretsLoad]: noArgs,
  [CH.secretsSave]: z.tuple([SecretsUpdateSchema]),
  [CH.secretsRecheck]: noArgs,
  [CH.secretsDevEnvVarNames]: noArgs,

  // Threads
  [CH.threadsLoad]: noArgs,
  [CH.threadsSave]: z.tuple([ThreadMapSchema]),
  [CH.threadsRepairRedundant]: z.tuple([RedundantThreadRepairRequestSchema]),
  [CH.threadsDeletePreview]: z.tuple([ThreadDeletionIdsSchema]),
  [CH.threadsDeleteApply]: z.tuple([ThreadDeletionIdsSchema, ThreadDeletionTokenSchema]),

  // QA pairs
  [CH.qaListAll]: noArgs,
  [CH.qaGet]: z.tuple([EntityId]),
  [CH.qaCreate]: z.tuple([QaCreateSchema]),
  [CH.qaUpdate]: z.tuple([EntityId, QaUpdateSchema]),
  [CH.qaDelete]: z.tuple([EntityId]),

  // Search
  [CH.searchQuery]: z.tuple([boundedString(2000), SearchTypeSchema]),
  [CH.searchSemantic]: z.tuple([boundedString(2000), boundedInt(1, 1000)]),

  // AI / LLM
  [CH.aiGenerateMetadata]: z.tuple([EntityId]),
  [CH.aiGenerateEmbedding]: z.tuple([EntityId]),
  [CH.aiGenerateAllEmbeddings]: noArgs,
  [CH.aiTestConnection]: noArgs,
  [CH.aiListProviders]: noArgs,
  [CH.aiListModels]: ListModelsArgs,
  [CH.aiSessionBrief]: z.tuple([InsightTextSchema]),
  [CH.aiPriorArt]: z.tuple([InsightTextSchema]),
  [CH.aiSteelman]: z.tuple([InsightTextSchema]),
  [CH.aiQuestionSeed]: z.tuple([InsightTextSchema]),
  [CH.aiConceptSummary]: z.tuple([InsightTextSchema]),
  [CH.aiGetTokenStats]: noArgs,
  [CH.aiResetTokenStats]: noArgs,
  [CH.aiGenerateAnnotations]: z.tuple([AnnotationIdsSchema]),
  [CH.aiApplyAnnotations]: z.tuple([ApplyAnnotationsSchema]),

  // Archive health / maintenance
  [CH.archiveHealthCheck]: noArgs,
  [CH.archiveResetPreview]: noArgs,
  [CH.archiveReset]: noArgs,

  // Tag dictionary
  [CH.tagsLoad]: noArgs,
  [CH.tagsSave]: z.tuple([TagDictionarySchema]),
  [CH.tagsAdd]: z.tuple([TagName, AliasesSchema]),
  [CH.tagsRemove]: z.tuple([TagName]),
  [CH.tagsRename]: z.tuple([TagName, TagName]),
  [CH.tagsAddAlias]: z.tuple([TagName, TagName]),
  [CH.tagsRemoveAlias]: z.tuple([TagName, TagName]),
  [CH.tagsResolve]: z.tuple([boundedString(200, 1)]),
  [CH.tagsSync]: noArgs,

  // Export / import
  [CH.exportQa]: z.tuple([EntityId]),
  [CH.exportThread]: z.tuple([EntityId]),
  [CH.importFile]: noArgs,
  [CH.importSharedLink]: z.tuple([SharedLinkUrlSchema]),
  [CH.importArchiveCommit]: z.tuple([PreviewIdSchema, BulkImportSelectionSchema]),
  [CH.importArchiveCancel]: z.tuple([PreviewIdSchema]),

  // Duplicate cleanup
  [CH.duplicatesScan]: noArgs,
  [CH.duplicatesDelete]: z.tuple([DuplicateCleanupRequestSchema]),

  // Shell
  [CH.openExternal]: z.tuple([UrlString]),
} satisfies Record<Channel, z.ZodTypeAny>

export type ChannelArgs = typeof channelArgs

/** Inferred argument tuple for a channel (used to type the handler registrar). */
export type ArgsOf<C extends Channel> = z.infer<ChannelArgs[C]>
