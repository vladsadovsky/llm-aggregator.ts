/**
 * fileExportService.ts
 * File-transport layer for export: shows Save dialog, writes file.
 * Delegates all serialisation to qaExportFormatService (pure, no FS).
 */

import { dialog, BrowserWindow } from 'electron'
import { writeFileSync } from 'fs'
import type { QAPairData } from './qaPairService'
import type { ThreadData } from './threadService'
import {
  formatQAExport,
  formatThreadExport,
  suggestedQAFilename,
  suggestedThreadFilename,
} from './qaExportFormatService'

const MD_FILTER = [{ name: 'Markdown', extensions: ['md'] }]

export interface ExportResult {
  savedPath: string
}

function resolveDialogWindow(targetWindow?: BrowserWindow | null): BrowserWindow | null {
  return targetWindow ?? BrowserWindow.getFocusedWindow() ?? null
}

/** Show Save dialog and write a single QA pair to file. */
export async function exportQAToFile(
  pair: QAPairData,
  targetWindow?: BrowserWindow | null,
): Promise<ExportResult | null> {
  const win = resolveDialogWindow(targetWindow)
  if (!win) return null

  const result = await dialog.showSaveDialog(win, {
    title: 'Export QA Pair',
    defaultPath: suggestedQAFilename(pair),
    filters: MD_FILTER,
  })

  if (result.canceled || !result.filePath) return null

  const content = formatQAExport(pair)
  writeFileSync(result.filePath, content, 'utf-8')
  return { savedPath: result.filePath }
}

/** Show Save dialog and write an entire thread (with all QA pairs) to file. */
export async function exportThreadToFile(
  thread: ThreadData,
  pairMap: Record<string, QAPairData>,
  targetWindow?: BrowserWindow | null,
): Promise<ExportResult | null> {
  const win = resolveDialogWindow(targetWindow)
  if (!win) return null

  const result = await dialog.showSaveDialog(win, {
    title: 'Export Thread',
    defaultPath: suggestedThreadFilename(thread),
    filters: MD_FILTER,
  })

  if (result.canceled || !result.filePath) return null

  const content = formatThreadExport(thread, pairMap)
  writeFileSync(result.filePath, content, 'utf-8')
  return { savedPath: result.filePath }
}
