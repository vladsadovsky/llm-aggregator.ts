/**
 * fileImportService.ts
 * File-transport layer for import: shows the Open dialog and routes the chosen
 * file down one of two pipelines.
 *
 * There is a single user-facing "Import from File" action on purpose — the user
 * should not have to classify their own file before picking a menu item. The
 * fork happens here, on content, not on the menu:
 *
 *   .md                     → qaImportFormatService  (one QA or one thread)
 *   .json / .zip / .csv     → import/archive/*       (an account export: many threads)
 *   anything else           → sniffed: archive if a format recognizes it, else Markdown
 *
 * Extension only decides *which sniffer runs first*; the archive pipeline
 * identifies the actual vendor format by structure, since ChatGPT, Claude, and
 * Gemini all ship a file named `conversations.json` with unrelated shapes.
 */

import { dialog, BrowserWindow } from 'electron'
import { readFileSync, statSync } from 'fs'
import { extname } from 'path'
import { parseImportFile, type ImportResult } from './qaImportFormatService'
import { previewArchive, storePreview, summarizePreview } from './import/archive/bulkImportService'
import { detectArchiveFormat } from './import/archive/formatRegistry'
import type { BulkImportPreviewSummary } from './import/archive/archiveTypes'
import { debugLog, debugError } from './logger'

/**
 * Dialog filters. The catch-all entry matters most on Linux/GTK, where a file
 * whose extension is not listed is *hidden* rather than merely de-emphasized —
 * vendors rename exports freely, and an unlisted extension would otherwise make
 * the file impossible to select.
 */
const IMPORT_FILTERS = [
  { name: 'All supported', extensions: ['md', 'json', 'zip', 'csv'] },
  { name: 'Markdown export', extensions: ['md'] },
  { name: 'Account export', extensions: ['json', 'zip', 'csv'] },
  { name: 'All files', extensions: ['*'] },
]

/** Extensions routed straight to the bulk (account export) pipeline. */
const ARCHIVE_EXTENSIONS = new Set(['.json', '.zip', '.csv'])

/**
 * Largest unknown-extension file we will read into memory just to guess its
 * format. Real exports are far below this; anything bigger is not worth probing.
 */
const MAX_SNIFF_BYTES = 256 * 1024 * 1024

/** Discriminated so the renderer knows which dialog to open next. */
export type FileImportOutcome =
  | { kind: 'markdown'; result: ImportResult }
  | { kind: 'archive'; preview: BulkImportPreviewSummary }

/** Show the Open dialog and parse whatever was chosen. Null when cancelled. */
export async function importFromFile(): Promise<FileImportOutcome | null> {
  const win = BrowserWindow.getFocusedWindow()
  if (!win) return null

  const result = await dialog.showOpenDialog(win, {
    title: 'Import Q&A, Thread, or Account Export',
    filters: IMPORT_FILTERS,
    properties: ['openFile'],
  })

  if (result.canceled || result.filePaths.length === 0) return null

  return importFromPath(result.filePaths[0])
}

/**
 * Route one path down the right pipeline. Split out from the dialog so it can be
 * unit-tested and reused (drag-and-drop, CLI) without opening a window.
 */
export async function importFromPath(chosen: string): Promise<FileImportOutcome> {
  const ext = extname(chosen).toLowerCase()
  debugLog('fileImport', 'chosen', chosen, 'ext', ext)

  const asArchive = async (): Promise<FileImportOutcome> => {
    const preview = await previewArchive(chosen)
    const previewId = storePreview(preview)
    return { kind: 'archive', preview: summarizePreview(preview, previewId) }
  }

  if (ARCHIVE_EXTENSIONS.has(ext)) return asArchive()

  // A folder is only ever an unzipped account export.
  try {
    if (statSync(chosen).isDirectory()) return await asArchive()
  } catch {
    /* fall through to the file paths below */
  }

  // Markdown is the documented export format, so trust the extension.
  if (ext === '.md') {
    return { kind: 'markdown', result: parseImportFile(readFileSync(chosen, 'utf-8')) }
  }

  // Unknown extension (or none): let the archive registry look at the content
  // before falling back to Markdown. Vendors rename exports, and Linux users in
  // particular end up with extensionless or oddly-named downloads.
  if (looksLikeArchiveContent(chosen)) return asArchive()

  return { kind: 'markdown', result: parseImportFile(readFileSync(chosen, 'utf-8')) }
}

/** Content probe for a file whose extension tells us nothing. */
function looksLikeArchiveContent(path: string): boolean {
  try {
    const size = statSync(path).size
    if (size > MAX_SNIFF_BYTES) return false

    const buffer = readFileSync(path)
    // "PK\x03\x04" — a zip the user renamed or downloaded without an extension.
    if (buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b) return true

    // Detection must see the whole document: a truncated prefix of a large JSON
    // export will not parse, so a prefix-only probe would reject valid exports.
    return detectArchiveFormat(buffer.toString('utf-8')) !== null
  } catch (err) {
    debugError('fileImport', 'content sniff failed', err)
    return false
  }
}
