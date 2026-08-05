/** AI / LLM channel payload schemas. */
import { z } from 'zod'
import { boundedString, EntityId } from './common'
import { QaConfidence } from './archive'

export const ProviderIdSchema = boundedString(64, 1)

/** A user-typed prompt/topic for the insight commands. */
export const InsightTextSchema = boundedString(8000, 1)

export const ListModelsArgs = z.tuple([
  ProviderIdSchema,
  z.boolean().optional(),
  boundedString(1024).optional(),
])

/** Job id for cancellable suggestion work (UUID). */
export const SuggestionJobIdSchema = boundedString(64, 1)

/** Suggest QA / thread title with an optional cancel job id. */
export const SuggestWithJobArgs = z.tuple([
  EntityId,
  SuggestionJobIdSchema.optional(),
])

/** Optional explicit id set for an annotation pass. */
export const AnnotationIdsSchema = z.array(EntityId).max(200_000).optional()

/** Approved confidence annotations to persist. */
export const ApplyAnnotationsSchema = z
  .array(
    z
      .object({
        id: EntityId,
        confidence: QaConfidence,
      })
      .strict(),
  )
  .max(200_000)
