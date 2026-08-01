/** Tag-dictionary payload schemas. */
import { z } from 'zod'
import { boundedString, boundedInt, TagName } from './common'

export const TagEntrySchema = z
  .object({
    created: boundedString(64),
    aliases: z.array(TagName).max(1000),
  })
  .strict()

export const TagDictionarySchema = z
  .object({
    version: boundedInt(0, 1_000_000),
    tags: z.record(boundedString(200), TagEntrySchema),
  })
  .strict()

export type TagDictionaryContract = z.infer<typeof TagDictionarySchema>

/** Optional alias list for `tags:add`. */
export const AliasesSchema = z.array(TagName).max(1000).optional()
