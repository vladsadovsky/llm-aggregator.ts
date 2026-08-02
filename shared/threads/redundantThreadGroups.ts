import type { ThreadMap } from '../../src/types/Thread'

export interface RedundantThreadGroup {
  /** Sorted, deduped item ids shared by every thread in this group. */
  itemIds: string[]
  /** All thread ids in the group, survivor first, remainder sorted. */
  threadIds: string[]
  survivorId: string
  redundantIds: string[]
  /** Distinct non-empty import identities. More than one must not be auto-merged. */
  importSourceIds: string[]
  /** True when member metadata differs and the UI should disclose every record. */
  metadataDiffers: boolean
}

export interface RedundantThreadRepairRequest {
  itemIds: string[]
  survivorId: string
  redundantIds: string[]
}

/**
 * Groups non-empty threads by canonical item-set fingerprint.
 * Any group with >1 member is a redundant-wrapper anomaly.
 *
 * Survivor selection (deterministic):
 *   1. Prefer the sole thread carrying `importSourceId`.
 *   2. Tie-break: lexicographically smallest thread id.
 */
export function findRedundantThreadGroups(threads: ThreadMap): RedundantThreadGroup[] {
  const byFingerprint = new Map<string, string[]>()

  for (const [tid, t] of Object.entries(threads)) {
    if (!t || !Array.isArray(t.items) || !t.items.every((id) => typeof id === 'string')) continue
    const items = [...new Set(t.items)].sort()
    if (items.length === 0) continue
    // JSON encoding is injective for string arrays. Delimiter joins are not:
    // ['a', 'b'] and ['a|b'] would otherwise collide and propose data deletion.
    const fp = JSON.stringify(items)
    if (!byFingerprint.has(fp)) byFingerprint.set(fp, [])
    byFingerprint.get(fp)!.push(tid)
  }

  const groups: RedundantThreadGroup[] = []

  for (const [fp, threadIds] of byFingerprint) {
    if (threadIds.length < 2) continue

    const withSourceId = threadIds.filter((id) => threads[id]?.importSourceId?.trim())
    const survivorId =
      withSourceId.length === 1 ? withSourceId[0] : [...threadIds].sort()[0]

    const sorted = [survivorId, ...threadIds.filter((id) => id !== survivorId).sort()]
    const importSourceIds = [...new Set(sorted
      .map((id) => threads[id]?.importSourceId?.trim())
      .filter((id): id is string => Boolean(id)))]
    const metadataSignatures = new Set(sorted.map((id) => {
      const thread = threads[id]
      return JSON.stringify({
        name: thread.name,
        tags: [...(thread.tags ?? [])].sort(),
        createdAt: thread.createdAt ?? null,
        updatedAt: thread.updatedAt ?? null,
        importSourceId: thread.importSourceId ?? null,
      })
    }))

    groups.push({
      itemIds: JSON.parse(fp) as string[],
      threadIds: sorted,
      survivorId,
      redundantIds: sorted.slice(1),
      importSourceIds,
      metadataDiffers: metadataSignatures.size > 1,
    })
  }

  return groups.sort((a, b) => a.survivorId.localeCompare(b.survivorId))
}

export interface ThreadMergePlan {
  survivorId: string
  mergedFields: {
    tags: string[]
    createdAt?: string
    updatedAt?: string
  }
  redundantIds: string[]
}

/**
 * Pure: computes the merged survivor record for a group.
 *   tags      — union of all members
 *   createdAt — earliest across the group
 *   updatedAt — latest across the group
 */
export function planThreadMerge(threads: ThreadMap, group: RedundantThreadGroup): ThreadMergePlan {
  const current = findRedundantThreadGroups(threads).find((candidate) =>
    candidate.survivorId === group.survivorId &&
    candidate.threadIds.length === group.threadIds.length &&
    candidate.threadIds.every((id, index) => id === group.threadIds[index]) &&
    candidate.itemIds.length === group.itemIds.length &&
    candidate.itemIds.every((id, index) => id === group.itemIds[index]))
  if (!current) throw new Error('The redundant-thread group changed. Scan the archive again.')
  if (current.importSourceIds.length > 1) {
    throw new Error('This group has multiple import identities and cannot be merged automatically.')
  }

  const members = current.threadIds.map((id) => threads[id])

  const allTags = [...new Set(members.flatMap((t) => t.tags ?? []))]

  const validDates = (field: 'createdAt' | 'updatedAt'): Array<{ value: string; time: number }> =>
    members.flatMap((thread) => {
      const value = thread[field]
      const time = value ? Date.parse(value) : Number.NaN
      return value && Number.isFinite(time) ? [{ value, time }] : []
    })
  const createdAt = validDates('createdAt').sort((a, b) => a.time - b.time)[0]?.value
  const updated = validDates('updatedAt').sort((a, b) => a.time - b.time)
  const updatedAt = updated[updated.length - 1]?.value

  return {
    survivorId: current.survivorId,
    mergedFields: { tags: allTags, createdAt, updatedAt },
    redundantIds: current.redundantIds,
  }
}
