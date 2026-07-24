/**
 * One-time migration: convert archive .md files from
 *   body: ## Question / ## Answer markers
 * to
 *   frontmatter: question field
 *   body: answer only (unrestricted markdown)
 *
 * Usage:  node scripts/migrate-qa-format.mjs
 * Safe to re-run: files already in new format (have `question:` in frontmatter) are skipped.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, extname, dirname } from 'path'
import { fileURLToPath } from 'url'
import matter from 'gray-matter'
import yaml from 'js-yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ARCHIVE_DIR = join(__dirname, '..', 'archive')

/** Replace bare `---` lines (YAML doc separators) with <hr> to keep YAML safe. */
function sanitizeForYaml(text) {
  return text.replace(/^---$/gm, '<hr>')
}

function serializeQAFile(frontmatter, answer) {
  const yamlStr = yaml.dump(frontmatter, { lineWidth: -1, noRefs: true, quotingType: '"' })
  return `---\n${yamlStr}---\n\n${answer.trim()}\n`
}

const files = readdirSync(ARCHIVE_DIR).filter(f => extname(f) === '.md')
let migrated = 0
let skipped = 0
let errors = 0

for (const file of files) {
  const filepath = join(ARCHIVE_DIR, file)
  try {
    const raw = readFileSync(filepath, 'utf-8')
    const { data: meta, content: body } = matter(raw)

    // Already migrated — question field exists in frontmatter
    if (meta.question !== undefined) {
      skipped++
      continue
    }

    // Extract question and answer using old format regexes
    const qMatch = body.match(/##?\s*Question\s*\n([\s\S]*?)(?=##?\s*Answer|\s*$)/)
    const aMatch = body.match(/##?\s*Answer\s*\n([\s\S]*)/)

    const question = qMatch ? qMatch[1].trim() : ''
    const answer = aMatch ? aMatch[1].trim() : body.trim()

    // Build new frontmatter — preserve all existing fields, add question
    const newMeta = { ...meta, question: sanitizeForYaml(question) }

    const newContent = serializeQAFile(newMeta, answer)
    writeFileSync(filepath, newContent, 'utf-8')
    migrated++
    console.log(`  migrated: ${file}`)
  } catch (err) {
    errors++
    console.error(`  ERROR: ${file}: ${err.message}`)
  }
}

console.log(`\nDone. migrated=${migrated}  skipped=${skipped}  errors=${errors}`)
