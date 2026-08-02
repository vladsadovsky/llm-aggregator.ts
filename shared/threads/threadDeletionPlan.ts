import type { ThreadMap } from '../../src/types/Thread'
import { findRedundantThreadGroups } from './redundantThreadGroups'

export interface ThreadDeletionPlan {
  threadIds: string[]
  candidateQaIds: string[]
  sharedQaIds: string[]
  sharedThreadIds: string[]
  missingThreadIds: string[]
  blockedRedundantGroups: Array<{ threadIds: string[]; itemIds: string[] }>
}

/** Pure ownership plan. A reference protects a QA only when its thread survives. */
export function planThreadDeletion(threads: ThreadMap, requestedIds: readonly string[]): ThreadDeletionPlan {
  const requested = [...new Set(requestedIds)].sort()
  const selected = new Set(requested.filter((id) => Boolean(threads[id])))
  const missingThreadIds = requested.filter((id) => !threads[id])
  const memberships = new Map<string, Set<string>>()

  for (const [threadId, thread] of Object.entries(threads)) {
    for (const qaId of new Set(thread.items)) {
      const owners = memberships.get(qaId) ?? new Set<string>()
      owners.add(threadId)
      memberships.set(qaId, owners)
    }
  }

  const selectedQaIds = new Set<string>()
  for (const threadId of selected) {
    for (const qaId of threads[threadId].items) selectedQaIds.add(qaId)
  }

  const candidateQaIds: string[] = []
  const sharedQaIds: string[] = []
  const sharedThreadIds = new Set<string>()
  for (const qaId of selectedQaIds) {
    const outsideOwners = [...(memberships.get(qaId) ?? [])].filter((threadId) => !selected.has(threadId))
    if (outsideOwners.length === 0) {
      candidateQaIds.push(qaId)
    } else {
      sharedQaIds.push(qaId)
      outsideOwners.forEach((threadId) => sharedThreadIds.add(threadId))
    }
  }

  const blockedRedundantGroups = findRedundantThreadGroups(threads)
    .filter((group) => group.threadIds.every((id) => selected.has(id)))
    .map((group) => ({ threadIds: [...group.threadIds], itemIds: [...group.itemIds] }))

  return {
    threadIds: [...selected].sort(),
    candidateQaIds: candidateQaIds.sort(),
    sharedQaIds: sharedQaIds.sort(),
    sharedThreadIds: [...sharedThreadIds].sort(),
    missingThreadIds,
    blockedRedundantGroups,
  }
}
