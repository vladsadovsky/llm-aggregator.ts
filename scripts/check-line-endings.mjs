/**
 * Pre-push line-ending guard.
 *
 * `.gitattributes` (`* text=auto eol=lf`) already normalizes tracked text files
 * to LF in the index on commit and pins the working tree to LF on checkout, so
 * per-commit manual checks are unnecessary. This is the belt-and-suspenders
 * guard for the pre-push run: it fails if any tracked `eol=lf` file has drifted
 * to CRLF/mixed endings in the working tree (e.g. a tool wrote it through a
 * CRLF-emitting path), and with `--fix` rewrites those files back to LF.
 *
 *   node scripts/check-line-endings.mjs        # verify (exit 1 on drift)
 *   node scripts/check-line-endings.mjs --fix  # rewrite offenders to LF
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const fix = process.argv.includes('--fix')

// `git ls-files --eol` rows: "i/<eol>  w/<eol>  attr/<...>\t<path>"
const rows = execFileSync('git', ['ls-files', '--eol'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean)

// Only flag files whose index copy is LF but whose working-tree copy drifted to
// CRLF/mixed. That is the churn-prone case `.gitattributes eol=lf` is meant to
// prevent, and rewriting the working tree to LF produces zero index change.
// A file that is CRLF *in the index* (i/crlf) is committed-CRLF; normalizing it
// is a deliberate, separate cleanup, not this guard's job (rewriting it here
// would create a spurious diff).
const offenders = []
for (const row of rows) {
  const match = /^i\/(\S+)\s+w\/(\S+)\s+attr\/(.*?)\t(.*)$/.exec(row)
  if (!match) continue
  const [, indexEol, workingEol, attr, path] = match
  if (attr.includes('binary') || attr.includes('-text')) continue // never normalize binaries
  if (indexEol === 'lf' && (workingEol === 'crlf' || workingEol === 'mixed')) offenders.push(path)
}

if (offenders.length === 0) {
  console.log('line endings: all tracked text files are LF in the working tree')
  process.exit(0)
}

if (!fix) {
  console.error(`line endings: ${offenders.length} tracked file(s) have CRLF/mixed endings in the working tree:`)
  for (const path of offenders) console.error(`  ${path}`)
  console.error('Run `npm run fix:line-endings` to rewrite them to LF.')
  process.exit(1)
}

for (const path of offenders) {
  const absolute = join(repositoryRoot, path)
  const lf = readFileSync(absolute, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  writeFileSync(absolute, lf)
  console.log(`fixed: ${path}`)
}
console.log(`line endings: rewrote ${offenders.length} file(s) to LF`)
