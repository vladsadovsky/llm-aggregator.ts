import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const electronMocks = vi.hoisted(() => ({
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn(),
  getFocusedWindow: vi.fn(() => ({})),
}))

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: electronMocks.showOpenDialog,
    showSaveDialog: electronMocks.showSaveDialog,
  },
  BrowserWindow: { getFocusedWindow: electronMocks.getFocusedWindow },
}))

import { importFromFile, MAX_MARKDOWN_IMPORT_BYTES } from '../../electron/services/fileImportService'
import { exportQAToFile } from '../../electron/services/fileExportService'

describe('file dialog transports', () => {
  let directory: string

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'llm-aggregator-dialog-test-'))
    electronMocks.getFocusedWindow.mockReturnValue({})
    electronMocks.showOpenDialog.mockReset()
    electronMocks.showSaveDialog.mockReset()
  })

  afterEach(() => rmSync(directory, { recursive: true, force: true }))

  it('routes a stubbed open-dialog selection through the Markdown importer', async () => {
    const inputPath = join(directory, 'qa.md')
    writeFileSync(inputPath, 'title: Dialog test\n\n## Question\n\nQuestion\n\n## Answer\n\nAnswer', 'utf8')
    electronMocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [inputPath] })

    const outcome = await importFromFile()

    expect(electronMocks.showOpenDialog).toHaveBeenCalledOnce()
    expect(outcome).toMatchObject({
      kind: 'markdown',
      result: { items: [{ data: { question: 'Question', answer: 'Answer' } }] },
    })
  })

  it('reopens import in the last selected directory', async () => {
    const importDirectory = join(directory, 'fixtures')
    const inputPath = join(importDirectory, 'qa.md')
    mkdirSync(importDirectory)
    writeFileSync(inputPath, 'title: Dialog test\n\n## Question\n\nQuestion\n\n## Answer\n\nAnswer', 'utf8')
    electronMocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [inputPath] })

    await importFromFile()
    await importFromFile()

    expect(electronMocks.showOpenDialog.mock.calls[1]?.[1]).toMatchObject({
      defaultPath: importDirectory,
    })
  })

  it('retains the last import directory after a cancelled dialog', async () => {
    const importDirectory = join(directory, 'fixtures')
    const inputPath = join(importDirectory, 'qa.md')
    mkdirSync(importDirectory)
    writeFileSync(inputPath, 'title: Dialog test\n\n## Question\n\nQuestion\n\n## Answer\n\nAnswer', 'utf8')
    electronMocks.showOpenDialog
      .mockResolvedValueOnce({ canceled: false, filePaths: [inputPath] })
      .mockResolvedValueOnce({ canceled: true, filePaths: [] })
      .mockResolvedValueOnce({ canceled: true, filePaths: [] })

    await importFromFile()
    await importFromFile()
    await importFromFile()

    expect(electronMocks.showOpenDialog.mock.calls[2]?.[1]).toMatchObject({
      defaultPath: importDirectory,
    })
  })

  it('writes only after a stubbed save-dialog selection', async () => {
    const outputPath = join(directory, 'qa-export.md')
    electronMocks.showSaveDialog.mockResolvedValue({ canceled: false, filePath: outputPath })

    const result = await exportQAToFile({
      id: 'qa-dialog',
      filepath: '',
      title: 'Dialog test',
      source: 'manual',
      url: '',
      tags: [],
      timestamp: '2026-07-31T00:00:00.000Z',
      version: 1,
      threadPairs: [],
      question: 'Question',
      answer: 'Answer',
    })

    expect(result).toEqual({ savedPath: outputPath })
    expect(readFileSync(outputPath, 'utf8')).toContain('## Question\n\nQuestion')
  })

  it('performs no file operation when either native dialog is cancelled', async () => {
    electronMocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    electronMocks.showSaveDialog.mockResolvedValue({ canceled: true })

    expect(await importFromFile()).toBeNull()
    expect(await exportQAToFile({} as never)).toBeNull()
  })

  it('rejects an oversized Markdown selection before reading parser input', async () => {
    const inputPath = join(directory, 'oversized.md')
    writeFileSync(inputPath, '')
    truncateSync(inputPath, MAX_MARKDOWN_IMPORT_BYTES + 1)
    electronMocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [inputPath] })

    await expect(importFromFile()).rejects.toThrow('Markdown import exceeds the 64 MiB limit')
  })
})
