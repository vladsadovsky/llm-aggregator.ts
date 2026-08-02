/** Shared-link and bulk (account export) import payload schemas. */
import { z } from 'zod'
import { boundedString, boundedInt, UrlString } from './common'

/** Opaque preview handle minted by main. Looked up in a map, never used as a path. */
export const PreviewIdSchema = boundedString(200, 1)

export const BulkImportSelectionSchema = z
  .object({
    // Provider `sourceId` / future `previewThreadId`: opaque, may repeat or be
    // empty, so only bounded — never treated as a path.
    threadSourceIds: z.array(boundedString(512)).max(200_000),
    skipDuplicates: z.boolean(),
    includeDateInThreadNames: z.boolean().optional(),
  })
  .strict()

export type BulkImportSelectionContract = z.infer<typeof BulkImportSelectionSchema>

/** Progress payload pushed main → renderer during a commit (validated on receipt). */
export const BulkImportProgressSchema = z
  .object({
    processed: boundedInt(0, Number.MAX_SAFE_INTEGER),
    total: boundedInt(0, Number.MAX_SAFE_INTEGER),
    percent: z.number().finite().min(0).max(100),
    etaSeconds: z.number().finite().min(0).nullable(),
    currentThreadName: boundedString(2000),
    currentItemTitle: boundedString(2000),
    threadsDone: boundedInt(0, Number.MAX_SAFE_INTEGER),
    threadsTotal: boundedInt(0, Number.MAX_SAFE_INTEGER),
  })
  .strict()

export type BulkImportProgressContract = z.infer<typeof BulkImportProgressSchema>

export const SharedLinkUrlSchema = UrlString
