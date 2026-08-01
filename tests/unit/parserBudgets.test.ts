/**
 * Application-level DoS budgets for the parsers that run on imported content.
 *
 * S2 (DEP-01) patched three algorithmic-complexity advisories via the lockfile
 * — markdown-it smartquotes (GHSA-6v5v-wf23-fmfq), linkify-it's mailto scan
 * (GHSA-v245-v573-v5vm), and js-yaml merge-key chains (GHSA-52cp-r559-cp3m).
 * These fixtures feed each pathological shape through the SAME configuration the
 * app uses (see MarkdownRenderer.vue and qaPairService.ts's gray-matter parse)
 * and assert it stays well under a time ceiling.
 *
 * They serve two purposes: prove the patched parsers are actually the ones
 * running, and stay useful as an application-level input budget after the V2
 * Electron/dependency upgrade — dependency fixes do not replace input budgets.
 */
import { describe, it, expect } from 'vitest'
import MarkdownIt from 'markdown-it'
import matter from 'gray-matter'

// Mirror MarkdownRenderer.vue — these two options are what reach the advisories.
const md = new MarkdownIt({ html: false, linkify: true, typographer: true })

/**
 * Generous on purpose. The patched parsers handle every input below in a few
 * milliseconds; the vulnerable versions went quadratic and would blow past this
 * on inputs this size. A wide margin keeps the test stable across machines while
 * still failing loudly if quadratic behavior is ever reintroduced.
 */
const CEILING_MS = 2000
const SCALE_RATIO_CEILING = 6
const SAMPLE_COUNT = 5

function elapsed(fn: () => void): number {
  const start = performance.now()
  fn()
  return performance.now() - start
}

function medianElapsed(fn: () => void): number {
  const samples = Array.from({ length: SAMPLE_COUNT }, () => elapsed(fn)).sort((a, b) => a - b)
  return samples[Math.floor(samples.length / 2)]
}

function expectRepeatableScaling(makeInput: (size: number) => string, render: (value: string) => void): void {
  const small = makeInput(15_000)
  const large = makeInput(30_000)
  render(makeInput(100)) // exclude parser/JIT cold start from the measured samples
  const smallMedian = medianElapsed(() => render(small))
  const largeMedian = medianElapsed(() => render(large))
  expect(largeMedian).toBeLessThan(Math.max(smallMedian, 1) * SCALE_RATIO_CEILING)
}

describe('parser budgets (imported-content DoS guards)', () => {
  it('markdown-it smartquotes stays linear on a wall of quotes', () => {
    expectRepeatableScaling((size) => '"a" '.repeat(size), (value) => { md.render(value) })
    const evil = '"a" '.repeat(60000)
    expect(elapsed(() => md.render(evil))).toBeLessThan(CEILING_MS)
  })

  it('linkify mailto validator stays linear on repeated mailto text', () => {
    expectRepeatableScaling(
      (size) => `${'mailto:'.repeat(size)}user@example.com`,
      (value) => { md.render(value) },
    )
    const evil = `${'mailto:'.repeat(40000)}user@example.com`
    expect(elapsed(() => md.render(evil))).toBeLessThan(CEILING_MS)
  })

  it('gray-matter / js-yaml merge-key chain stays linear', () => {
    // A chain where each anchor merges every previous one — the classic shape
    // that forces quadratic (billion-laughs-style) expansion on the merge path.
    const lines: string[] = ['---', 'a0: &a0']
    lines.push('  k: v')
    for (let i = 1; i < 80; i += 1) {
      const refs = Array.from({ length: i }, (_, j) => `*a${j}`).join(', ')
      lines.push(`a${i}: &a${i}`)
      lines.push(`  <<: [${refs}]`)
      lines.push(`  k${i}: ${i}`)
    }
    lines.push('---', 'body text')
    const doc = lines.join('\n')

    // A throw is fine (no DoS); a hang is not. Only the wall-clock bound matters.
    expect(
      elapsed(() => {
        try {
          matter(doc)
        } catch {
          /* malformed is acceptable; hanging is not */
        }
      }),
    ).toBeLessThan(CEILING_MS)
  })
})
