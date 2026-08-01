/**
 * INV-PATH: one immutable snapshot resolves every archive path, normalizes the
 * "selected archive/ itself" case, and derives a stable per-archive namespace.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '/tmp/userData' } }))

import { resolveArchivePaths } from '../../electron/services/persistence/archivePaths'
import { join, resolve, basename } from 'path'

describe('resolveArchivePaths', () => {
  it('derives archive/threads/tags paths under the data root', () => {
    const p = resolveArchivePaths(resolve('/data/root'))
    expect(basename(p.archiveDir)).toBe('archive')
    expect(basename(p.threadsPath)).toBe('threads.json')
    expect(basename(p.tagsPath)).toBe('tag-dictionary.json')
    expect(p.archiveDir).toBe(join(p.dataRoot, 'archive'))
  })

  it('normalizes the case where the user selected the archive/ folder itself', () => {
    const viaRoot = resolveArchivePaths(resolve('/data/root'))
    const viaArchive = resolveArchivePaths(resolve('/data/root/archive'))
    expect(viaArchive.dataRoot).toBe(viaRoot.dataRoot)
    expect(viaArchive.archiveDir).toBe(viaRoot.archiveDir)
    expect(viaArchive.namespace).toBe(viaRoot.namespace)
  })

  it('produces a stable 16-hex namespace, distinct per archive path', () => {
    const a = resolveArchivePaths(resolve('/data/one'))
    const b = resolveArchivePaths(resolve('/data/one'))
    const c = resolveArchivePaths(resolve('/data/two'))
    expect(a.namespace).toMatch(/^[0-9a-f]{16}$/)
    expect(a.namespace).toBe(b.namespace)
    expect(a.namespace).not.toBe(c.namespace)
  })

  it('returns a frozen snapshot', () => {
    const p = resolveArchivePaths(resolve('/data/root'))
    expect(Object.isFrozen(p)).toBe(true)
  })

  it.runIf(process.platform === 'win32')('is case-insensitive on Windows', () => {
    const upper = resolveArchivePaths('C:/Data/Root')
    const lower = resolveArchivePaths('c:/data/root')
    expect(upper.namespace).toBe(lower.namespace)
  })
})
