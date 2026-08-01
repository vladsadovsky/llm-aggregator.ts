/**
 * Shared runtime-validation primitives for the IPC contract layer.
 *
 * Everything here is main-side (it pulls in `zod`); the sandboxed preload must
 * only ever import `channels.ts`, never this module.
 */
import { z } from 'zod'

export * from './errorWire'

/**
 * Summarize a zod failure without echoing any submitted value — path + issue
 * code only. Safe to return to the renderer and to log.
 */
export function summarizeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((i) => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.code}`)
    .join('; ')
}

// ─── Reusable field schemas ──────────────────────────────────────────────────

/** A bounded UTF-16 string. `max` is a hard character ceiling. */
export function boundedString(max: number, min = 0): z.ZodString {
  return z.string().min(min).max(max)
}

/**
 * A single filesystem-safe identifier segment (QA id, thread id, preview id).
 * Allowlisted charset rejects traversal shapes and separators so a renderer
 * value can never widen into a path (`INV-PATH`). Path *containment* is still
 * enforced again in main — this is the first, not the only, control.
 *
 * Allowed punctuation: `_` (timestamp ids), `-` and `.` (UUID preview ids).
 */
export const safeSegment = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9._-]+$/, { message: 'charset' })
  .refine((s) => !s.includes('..'), { message: 'traversal' })

/** A QA / thread / preview id used to address a file. */
export const EntityId = safeSegment

/** Large free text (QA question/answer, message bodies). 5 MiB char ceiling. */
export const LargeText = boundedString(5_000_000)

/** A QA `source` label. Not a path — sanitized again before use in filenames. */
export const SourceName = boundedString(64)

/** A tag string. */
export const TagName = boundedString(200, 1)

/** A bounded tag array. */
export const TagArray = z.array(TagName).max(500)

/** A URL string carried to main for further policy checks. */
export const UrlString = boundedString(2048, 1)

/** A finite integer within an inclusive range. */
export function boundedInt(min: number, max: number): z.ZodNumber {
  return z.number().int().finite().min(min).max(max)
}
