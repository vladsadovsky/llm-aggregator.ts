/**
 * The e2e userData isolation guard (issue #15 / S7). A string prefix once let a
 * sibling directory pass the barrier that keeps e2e off the real profile.
 */
import { describe, it, expect } from 'vitest'
import path from 'path'
import { isSameUserDataDir } from '../e2e/isolation'

const root = path.resolve(path.sep === '\\' ? 'C:\\tmp\\run' : '/tmp/run')

describe('isSameUserDataDir', () => {
  it('accepts the exact isolated profile', () => {
    expect(isSameUserDataDir(path.join(root, 'userdata'), path.join(root, 'userdata'))).toBe(true)
  })

  it('rejects a sibling that only shares a string prefix', () => {
    expect(isSameUserDataDir(path.join(root, 'userdata-old'), path.join(root, 'userdata'))).toBe(false)
  })

  it('rejects a descendant of the expected directory', () => {
    expect(isSameUserDataDir(path.join(root, 'userdata', 'sub'), path.join(root, 'userdata'))).toBe(false)
  })

  it('rejects the real profile entirely', () => {
    expect(isSameUserDataDir(path.join(root, 'other'), path.join(root, 'userdata'))).toBe(false)
  })
})
