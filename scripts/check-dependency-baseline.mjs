import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const lockfile = JSON.parse(readFileSync(join(repositoryRoot, 'package-lock.json'), 'utf8'))
const rootRequire = createRequire(join(repositoryRoot, 'package.json'))

function dependencyFrom(name, parentPackage) {
  const resolver = parentPackage
    ? createRequire(rootRequire.resolve(`${parentPackage}/package.json`))
    : rootRequire
  const packagePath = resolver.resolve(`${name}/package.json`)
  const installed = JSON.parse(readFileSync(packagePath, 'utf8')).version
  const lockKey = relative(repositoryRoot, dirname(packagePath)).replaceAll('\\', '/')
  const locked = lockfile.packages[lockKey]?.version
  if (!locked) throw new Error(`${name}: installed path is absent from package-lock.json (${lockKey})`)
  if (installed !== locked) throw new Error(`${name}: installed ${installed}, lockfile records ${locked}`)
  return installed
}

function compareVersions(actual, minimum) {
  const a = actual.split('.').map(Number)
  const b = minimum.split('.').map(Number)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) - (b[index] ?? 0)
  }
  return 0
}

const baseline = [
  ['markdown-it', 'markdown-it', undefined, '14.3.0'],
  ['linkify-it (markdown-it)', 'linkify-it', 'markdown-it', '5.0.2'],
  ['js-yaml (gray-matter)', 'js-yaml', 'gray-matter', '3.15.0'],
  ['postcss (vite)', 'postcss', 'vite', '8.5.24'],
]

for (const [label, name, parent, minimum] of baseline) {
  const actual = dependencyFrom(name, parent)
  if (compareVersions(actual, minimum) < 0) {
    throw new Error(`${label}: ${actual} is below the security baseline ${minimum}`)
  }
  console.log(`${label}: ${actual} (minimum ${minimum})`)
}
