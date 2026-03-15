/**
 * fileImportService.ts
 * File-transport layer for import: shows Open dialog, reads file,
 * delegates parsing to qaImportFormatService (pure, no FS).
 */

import { dialog, BrowserWindow } from 'electron'
import { readFileSync } from 'fs'
import { parseImportFile, type ImportResult } from './qaImportFormatService'

const MD_FILTER = [{ name: 'Markdown', extensions: ['md'] }]

/** Show Open dialog, read the chosen file, and return parsed ImportResult. */
export async function importFromFile(): Promise<ImportResult | null> {
  const win = BrowserWindow.getFocusedWindow()
  if (!win) return null

  const result = await dialog.showOpenDialog(win, {
    title: 'Import QA / Thread',
    filters: MD_FILTER,
    properties: ['openFile'],
  })

  if (result.canceled || result.filePaths.length === 0) return null

  const fileContent = readFileSync(result.filePaths[0], 'utf-8')
  return parseImportFile(fileContent)
}
