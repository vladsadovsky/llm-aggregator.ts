import { createHash, randomUUID } from 'crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  unlinkSync,
} from 'fs'
import { basename, join } from 'path'
import type { ThreadMap } from '../../src/types/Thread'
import { ipcError } from '../../shared/contracts/errorWire'
import { planThreadDeletion } from '../../shared/threads/threadDeletionPlan'
import { atomicWriteJsonSync } from './persistence/atomicFile'
import { getDataDir } from './pathResolver'
import { scanArchive, type QAPairData } from './qaPairService'
import type { ArchiveScan } from './persistence/qaIndex'
import { loadThreads, saveThreads } from './threadService'

export interface ThreadDeletionPreview {
  token: string
  threadIds: string[]
  qaIdsToDelete: string[]
  sharedQaIds: string[]
  sharedThreadIds: string[]
}

export interface ThreadDeletionResult extends ThreadDeletionPreview {
  threads: ThreadMap
  cleanupPending: boolean
}

interface StagedDeletion { id: string; finish: () => void; rollback: () => void }

export interface ThreadDeletionDeps {
  load: () => ThreadMap
  save: (threads: ThreadMap) => void
  scan: () => ArchiveScan
  stage: (pairs: QAPairData[], before: ThreadMap, after: ThreadMap) => StagedDeletion
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function tokenFor(threads: ThreadMap, preview: unknown): string {
  return createHash('sha256').update(stable({ threads, preview })).digest('hex')
}

export interface DeleteManifest {
  version: 1
  state: 'prepared' | 'committed'
  before: ThreadMap
  after: ThreadMap
  files: Array<{ id: string; name: string }>
}

function transactionRoot(): string { return join(getDataDir(), '.thread-delete-transactions') }

function assertSafeTransactionRoot(root: string): void {
  if (existsSync(root) && lstatSync(root).isSymbolicLink()) {
    throw ipcError('needs-repair', 'The deletion recovery directory is not safe to use.')
  }
}

function safeFileName(name: string): boolean {
  return name === basename(name) && name.endsWith('.md') && name.length > 3
}

function cleanupTransaction(dir: string, manifest: DeleteManifest): void {
  for (const file of manifest.files) {
    const staged = join(dir, file.name)
    if (existsSync(staged)) unlinkSync(staged)
  }
  const manifestPath = join(dir, 'manifest.json')
  if (existsSync(manifestPath)) unlinkSync(manifestPath)
  rmdirSync(dir)
}

function finalizeTransaction(dir: string, manifest: DeleteManifest): void {
  const archiveDir = join(getDataDir(), 'archive')
  for (const file of manifest.files) {
    if (existsSync(join(archiveDir, file.name))) {
      throw ipcError('needs-repair', 'Deletion recovery found an unexpected Q&A file. Repair the archive before continuing.')
    }
  }
  cleanupTransaction(dir, manifest)
}

function restoreTransaction(dir: string, manifest: DeleteManifest): void {
  const archiveDir = join(getDataDir(), 'archive')
  for (const file of manifest.files) {
    if (!safeFileName(file.name)) throw ipcError('needs-repair', 'A deletion recovery record is invalid.')
    const staged = join(dir, file.name)
    const original = join(archiveDir, file.name)
    if (existsSync(staged) && existsSync(original)) {
      throw ipcError('needs-repair', 'Deletion recovery found conflicting Q&A files. Repair the archive before continuing.')
    }
    if (existsSync(staged)) renameSync(staged, original)
  }
  cleanupTransaction(dir, manifest)
}

function defaultStage(pairs: QAPairData[], before: ThreadMap, after: ThreadMap): StagedDeletion {
  const root = transactionRoot()
  assertSafeTransactionRoot(root)
  const dir = join(root, randomUUID())
  mkdirSync(dir, { recursive: true })
  const files = pairs.map((pair) => ({ id: pair.id, name: basename(pair.filepath) }))
  if (files.some((file) => !safeFileName(file.name)) || new Set(files.map((file) => file.name)).size !== files.length) {
    rmdirSync(dir)
    throw ipcError('needs-repair', 'The Q&A files selected for deletion are not uniquely addressable.')
  }
  const manifest: DeleteManifest = { version: 1, state: 'prepared', before, after, files }
  try {
    atomicWriteJsonSync(join(dir, 'manifest.json'), manifest)
  } catch (error) {
    rmdirSync(dir)
    throw error
  }

  try {
    for (const pair of pairs) renameSync(pair.filepath, join(dir, basename(pair.filepath)))
  } catch (error) {
    restoreTransaction(dir, manifest)
    throw error
  }

  return {
    id: basename(dir),
    rollback: () => restoreTransaction(dir, manifest),
    finish: () => {
      const committed = { ...manifest, state: 'committed' as const }
      atomicWriteJsonSync(join(dir, 'manifest.json'), committed)
      finalizeTransaction(dir, committed)
    },
  }
}

const defaultDeps: ThreadDeletionDeps = {
  load: loadThreads,
  save: saveThreads,
  scan: scanArchive,
  stage: defaultStage,
}

function buildPreview(threadIds: readonly string[], deps: ThreadDeletionDeps): { preview: ThreadDeletionPreview; threads: ThreadMap; after: ThreadMap; pairs: QAPairData[] } {
  const threads = deps.load()
  const plan = planThreadDeletion(threads, threadIds)
  if (plan.missingThreadIds.length > 0 || plan.threadIds.length !== new Set(threadIds).size) {
    throw ipcError('needs-repair', 'The selected threads changed. Refresh the archive and try again.')
  }
  if (plan.blockedRedundantGroups.length > 0) {
    throw ipcError('needs-repair', 'This selection contains every wrapper in a redundant-thread group. Use Tools → Inspect & Repair Archive before deleting it.')
  }
  const scan = deps.scan()
  const allPairs = scan.pairs
  const duplicates = new Set(scan.duplicates.map((duplicate) => duplicate.id))
  if (plan.candidateQaIds.some((id) => duplicates.has(id))) {
    throw ipcError('needs-repair', 'A Q&A selected for deletion has duplicate archive files. Use the repair tools first.')
  }
  const qaIdsToDelete = plan.candidateQaIds.filter((id) => Boolean(allPairs[id]))
  const after = structuredClone(threads)
  plan.threadIds.forEach((id) => delete after[id])
  const withoutToken = {
    threadIds: plan.threadIds,
    qaIdsToDelete,
    sharedQaIds: plan.sharedQaIds.filter((id) => Boolean(allPairs[id])),
    sharedThreadIds: plan.sharedThreadIds,
  }
  const qaSignatures = qaIdsToDelete.map((id) => {
    const pair = allPairs[id]
    return {
      id,
      filepath: pair.filepath,
      version: pair.version,
      timestamp: pair.timestamp,
      question: pair.question,
      answer: pair.answer,
    }
  })
  return {
    preview: { token: tokenFor(threads, { ...withoutToken, qaSignatures }), ...withoutToken },
    threads,
    after,
    pairs: qaIdsToDelete.map((id) => allPairs[id]),
  }
}

export function previewThreadDeletion(threadIds: readonly string[], deps: ThreadDeletionDeps = defaultDeps): ThreadDeletionPreview {
  return buildPreview(threadIds, deps).preview
}

export function deleteThreadsWithContents(threadIds: readonly string[], expectedToken: string, deps: ThreadDeletionDeps = defaultDeps): ThreadDeletionResult {
  const current = buildPreview(threadIds, deps)
  if (current.preview.token !== expectedToken) {
    throw ipcError('needs-repair', 'The archive changed after confirmation. Review the deletion again.')
  }
  const staged = deps.stage(current.pairs, current.threads, current.after)
  try {
    deps.save(current.after)
  } catch (error) {
    try { staged.rollback() } catch {
      throw ipcError('needs-repair', `Thread deletion ${staged.id} could not be rolled back. Repair the archive before continuing.`)
    }
    throw error
  }

  let cleanupPending = false
  try { staged.finish() } catch { cleanupPending = true }
  return { ...current.preview, threads: current.after, cleanupPending }
}

export type ThreadDeletionRecoveryAction = 'rollback' | 'finalize' | 'blocked'

export function decideThreadDeletionRecovery(current: ThreadMap, manifest: DeleteManifest): ThreadDeletionRecoveryAction {
  if (manifest.state === 'committed') {
    const deletedIds = new Set(manifest.files.map((file) => file.id))
    const referencedAgain = Object.values(current).some((thread) => thread.items.some((id) => deletedIds.has(id)))
    return referencedAgain ? 'blocked' : 'finalize'
  }
  if (stable(current) === stable(manifest.after)) return 'finalize'
  if (stable(current) === stable(manifest.before)) return 'rollback'
  return 'blocked'
}

/** Resolve an interrupted delete before the renderer can load a half-state. */
export function recoverThreadDeletions(): void {
  const root = transactionRoot()
  if (!existsSync(root)) return
  assertSafeTransactionRoot(root)
  for (const entry of readdirSync(root)) {
    const dir = join(root, entry)
    const kind = lstatSync(dir)
    if (kind.isSymbolicLink() || !kind.isDirectory()) {
      throw ipcError('needs-repair', 'The deletion recovery directory contains an unsafe entry.')
    }
    const raw = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as DeleteManifest
    if (raw.version !== 1 || (raw.state !== 'prepared' && raw.state !== 'committed') ||
        !raw.before || typeof raw.before !== 'object' || !raw.after || typeof raw.after !== 'object' ||
        !Array.isArray(raw.files) || raw.files.some((file) =>
          !file || typeof file.id !== 'string' || typeof file.name !== 'string' || !safeFileName(file.name))) {
      throw ipcError('needs-repair', 'A thread-deletion recovery record is corrupt.')
    }
    const current = loadThreads()
    const action = decideThreadDeletionRecovery(current, raw)
    if (action === 'finalize') finalizeTransaction(dir, raw)
    else if (action === 'rollback') restoreTransaction(dir, raw)
    else throw ipcError('needs-repair', 'The archive changed during deletion recovery. Repair it before continuing.')
  }
  if (readdirSync(root).length === 0) rmdirSync(root)
}
