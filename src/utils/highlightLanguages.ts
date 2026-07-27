/**
 * utils/highlightLanguages.ts
 * The syntax-highlighting vocabulary, registered explicitly.
 *
 * The default `import hljs from 'highlight.js'` entry point bundles all ~190
 * grammars — roughly 750 kB minified, about 45% of the entire renderer bundle
 * (see issue #7). Importing `highlight.js/lib/core` and registering a curated
 * list costs a fraction of that.
 *
 * **Degradation is graceful, not silent-broken.** `MarkdownRenderer` guards
 * every highlight call with `hljs.getLanguage(lang)`, so a fence tagged with a
 * language that is not registered here still renders — as plain escaped text,
 * just without colouring. Nothing is dropped or corrupted.
 *
 * Adding a language is one import plus one row. Prefer that over reverting to
 * the all-languages entry point.
 *
 * Aliases come free with each grammar: registering `javascript` also matches
 * ```js / ```jsx / ```mjs, `python` matches ```py, `bash` matches ```sh, `xml`
 * matches ```html, and so on.
 */

import type { LanguageFn } from 'highlight.js'

import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import graphql from 'highlight.js/lib/languages/graphql'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import less from 'highlight.js/lib/languages/less'
import lua from 'highlight.js/lib/languages/lua'
import makefile from 'highlight.js/lib/languages/makefile'
import markdown from 'highlight.js/lib/languages/markdown'
import objectivec from 'highlight.js/lib/languages/objectivec'
import perl from 'highlight.js/lib/languages/perl'
import php from 'highlight.js/lib/languages/php'
import plaintext from 'highlight.js/lib/languages/plaintext'
import powershell from 'highlight.js/lib/languages/powershell'
import python from 'highlight.js/lib/languages/python'
import r from 'highlight.js/lib/languages/r'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import scala from 'highlight.js/lib/languages/scala'
import scss from 'highlight.js/lib/languages/scss'
import shell from 'highlight.js/lib/languages/shell'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

/** Canonical name → grammar. Aliases are registered by highlight.js itself. */
export const HIGHLIGHT_LANGUAGES: ReadonlyArray<readonly [string, LanguageFn]> = [
  ['bash', bash],
  ['c', c],
  ['cpp', cpp],
  ['csharp', csharp],
  ['css', css],
  ['diff', diff],
  ['dockerfile', dockerfile],
  ['go', go],
  ['graphql', graphql],
  ['ini', ini],
  ['java', java],
  ['javascript', javascript],
  ['json', json],
  ['kotlin', kotlin],
  ['less', less],
  ['lua', lua],
  ['makefile', makefile],
  ['markdown', markdown],
  ['objectivec', objectivec],
  ['perl', perl],
  ['php', php],
  ['plaintext', plaintext],
  ['powershell', powershell],
  ['python', python],
  ['r', r],
  ['ruby', ruby],
  ['rust', rust],
  ['scala', scala],
  ['scss', scss],
  ['shell', shell],
  ['sql', sql],
  ['swift', swift],
  ['typescript', typescript],
  ['xml', xml],
  ['yaml', yaml],
]
