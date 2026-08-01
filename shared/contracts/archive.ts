/** QA-pair, thread, search, and duplicate-cleanup payload schemas. */
import { z } from 'zod'
import {
  boundedString,
  EntityId,
  LargeText,
  SourceName,
  TagArray,
} from './common'

export const QaStatus = z.enum(['open', 'closed', 'speculative', 'dead-end'])
export const QaConfidence = z.enum(['speculative', 'working', 'confident', 'validated'])

export const QaCreateSchema = z
  .object({
    title: boundedString(1000),
    source: SourceName,
    url: boundedString(2048),
    tags: TagArray,
    question: LargeText,
    answer: LargeText,
    originId: boundedString(512).optional(),
    timestamp: boundedString(64).optional(),
  })
  .strict()

export type QaCreateContract = z.infer<typeof QaCreateSchema>

export const QaUpdateSchema = z
  .object({
    title: boundedString(1000).optional(),
    source: SourceName.optional(),
    url: boundedString(2048).optional(),
    tags: TagArray.optional(),
    question: LargeText.optional(),
    answer: LargeText.optional(),
    aiTopic: boundedString(500).optional(),
    aiConcepts: z.array(boundedString(200)).max(200).optional(),
    aiStatus: QaStatus.optional(),
    aiConfidence: QaConfidence.optional(),
    aiSummary: boundedString(4000).optional(),
    aiRelatedIds: z.array(EntityId).max(1000).optional(),
  })
  .strict()

export type QaUpdateContract = z.infer<typeof QaUpdateSchema>

export const ThreadDataSchema = z
  .object({
    name: boundedString(1000),
    items: z.array(EntityId).max(200_000),
    tags: TagArray.optional(),
    createdAt: boundedString(64).optional(),
    updatedAt: boundedString(64).optional(),
  })
  .strict()

/** The whole thread map, as sent by `threads:save`. Keys are thread ids. */
export const ThreadMapSchema = z.record(boundedString(256), ThreadDataSchema)

export type ThreadMapContract = z.infer<typeof ThreadMapSchema>

export const SearchTypeSchema = z.enum(['full-text', 'tags'])

/** `duplicates:delete` — the explicit list of ids to remove. */
export const DuplicateIdsSchema = z.array(EntityId).max(200_000)
