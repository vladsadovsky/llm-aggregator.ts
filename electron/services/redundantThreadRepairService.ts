import type { ThreadMap } from '../../src/types/Thread'
import {
  findRedundantThreadGroups,
  planThreadMerge,
  type RedundantThreadRepairRequest,
} from '../../shared/threads/redundantThreadGroups'
import { ipcError } from '../../shared/contracts/errorWire'
import { loadThreads, saveThreads } from './threadService'

export interface RedundantThreadRepairResult {
  threads: ThreadMap
  mergedGroups: number
  removedThreadIds: string[]
}

export interface RedundantThreadRepairDeps {
  load: () => ThreadMap
  save: (threads: ThreadMap) => void
}

const defaultDeps: RedundantThreadRepairDeps = { load: loadThreads, save: saveThreads }

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

/**
 * Validate against a fresh durable snapshot, apply every requested group to a
 * clone, and promote the complete thread map with one atomic save. QA files are
 * deliberately outside this service's dependency surface.
 */
export function repairRedundantThreadGroups(
  requests: readonly RedundantThreadRepairRequest[],
  deps: RedundantThreadRepairDeps = defaultDeps,
): RedundantThreadRepairResult {
  const current = deps.load()
  const staged = structuredClone(current)
  const removedThreadIds: string[] = []
  const claimedIds = new Set<string>()

  for (const request of requests) {
    const groups = findRedundantThreadGroups(staged)
    const group = groups.find((candidate) =>
      candidate.survivorId === request.survivorId &&
      sameStrings(candidate.itemIds, request.itemIds) &&
      sameStrings(candidate.redundantIds, request.redundantIds))
    if (!group) {
      throw ipcError('needs-repair', 'The archive changed after the scan. Scan again before merging.')
    }
    if (group.importSourceIds.length > 1) {
      throw ipcError(
        'needs-repair',
        'A redundant-looking group has multiple import identities and requires manual review.',
      )
    }
    for (const id of group.threadIds) {
      if (claimedIds.has(id)) {
        throw ipcError('invalid-payload', 'A thread was included in more than one repair group.')
      }
      claimedIds.add(id)
    }

    const plan = planThreadMerge(staged, group)
    const survivor = staged[plan.survivorId]
    staged[plan.survivorId] = {
      ...survivor,
      items: [...new Set(survivor.items)],
      tags: plan.mergedFields.tags.length > 0 ? plan.mergedFields.tags : undefined,
      ...(plan.mergedFields.createdAt ? { createdAt: plan.mergedFields.createdAt } : {}),
      ...(plan.mergedFields.updatedAt ? { updatedAt: plan.mergedFields.updatedAt } : {}),
    }
    for (const id of plan.redundantIds) {
      delete staged[id]
      removedThreadIds.push(id)
    }
  }

  // A single atomic promotion means a process exit or write failure cannot
  // expose a half-merged group or a partially completed Merge All.
  deps.save(staged)
  return { threads: staged, mergedGroups: requests.length, removedThreadIds }
}
