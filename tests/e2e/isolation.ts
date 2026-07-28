import path from 'path'

/**
 * Exact-path equality for the e2e `userData` isolation guard (issue #15).
 *
 * A `startsWith` prefix check would accept a sibling like `<root>/userdata-old`
 * for an expected `<root>/userdata`. This guard is the barrier that keeps e2e
 * runs off a developer's real secrets/settings, so it must fail closed: compare
 * resolved paths for equality. Windows paths are case-insensitive; POSIX is not.
 */
export function isSameUserDataDir(resolvedUserData: string, expectedUserData: string): boolean {
  const a = path.resolve(resolvedUserData)
  const b = path.resolve(expectedUserData)
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}
