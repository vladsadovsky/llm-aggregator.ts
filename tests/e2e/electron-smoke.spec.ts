import { test, expect } from './electron.fixture'

test.describe('Electron 43 fundamentals', () => {
  test('@smoke loads the production renderer, exposes preload, and completes a QA round trip', async ({ window }) => {
    await expect(window.locator('#app')).toBeVisible()
    expect(new URL(window.url()).protocol).toBe('file:')

    const result = await window.evaluate(async () => {
      const api = window.api
      const created = await api.qaCreate({
        title: 'Electron smoke QA',
        source: 'smoke',
        url: '',
        tags: ['electron-smoke'],
        question: 'Does the preload bridge survive the runtime upgrade?',
        answer: 'Yes.',
      })
      const loaded = await api.qaGet(created.id)
      return {
        bridgePresent: typeof api.qaCreate === 'function' && typeof api.qaGet === 'function',
        createdId: created.id,
        loaded,
      }
    })

    expect(result.bridgePresent).toBe(true)
    expect(result.loaded).toMatchObject({
      id: result.createdId,
      question: 'Does the preload bridge survive the runtime upgrade?',
      answer: 'Yes.',
    })
  })

  test('@smoke denies remote navigation and renderer-created windows', async ({ electronApp, window }) => {
    const originalUrl = window.url()
    const originalWindowCount = await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)

    await window.evaluate(() => {
      window.open('https://example.com/popup')
      const link = document.createElement('a')
      link.href = 'https://example.com/navigation'
      link.textContent = 'blocked navigation probe'
      document.body.append(link)
      link.click()
    })
    await window.waitForTimeout(250)

    const state = await electronApp.evaluate(async ({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows()
      const main = windows[0]
      return {
        windowCount: windows.length,
        url: main.webContents.getURL(),
        appPresent: await main.webContents.executeJavaScript("Boolean(document.querySelector('#app'))"),
        bridgeType: await main.webContents.executeJavaScript('typeof window.api.qaListAll'),
      }
    })

    expect(state).toEqual({
      windowCount: originalWindowCount,
      url: originalUrl,
      appPresent: true,
      bridgeType: 'function',
    })
  })
})
