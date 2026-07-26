import { test, expect } from './electron.fixture'

test.describe('Settings dialog', () => {
  test('keeps actions reachable at a constrained window height', async ({ window }) => {
    await window.setViewportSize({ width: 900, height: 600 })
    await window.getByTitle(/Settings/).click()

    const dialog = window.locator('.settings-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeVisible()

    await dialog.getByRole('tab', { name: 'AI' }).click()
    await expect(dialog.getByRole('button', { name: 'Re-check secure storage' })).toBeVisible()
    await expect(dialog.getByText('No API key is configured', { exact: false })).toHaveCount(0)
    await expect(dialog.getByText('previously stored API keys', { exact: false })).toHaveCount(0)
    await dialog.locator('.settings-content').evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeVisible()

    await dialog.getByRole('tab', { name: 'Metadata & Tags' }).click()
    await expect(dialog.getByText(/Tag dictionary: \d+ tags/)).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeVisible()
  })

  test('shows detailed secret warnings in Application Status', async ({ window }) => {
    await expect(window.getByTestId('thread-list')).toBeVisible()
    await window.keyboard.press('Control+K')
    await window.getByText('Application Status', { exact: true }).click()

    const dialog = window.getByRole('dialog', { name: 'Application Status' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('No API key is configured', { exact: false })).toBeVisible()
  })

  test('opens the command palette from a focused input and zooms QA content', async ({ window }) => {
    const search = window.getByTestId('search-input')
    await expect(search).toBeVisible()
    await search.focus()
    await window.keyboard.press('Control+K')
    await expect(window.locator('.command-palette')).toBeVisible()

    await window.getByText('Zoom Content In', { exact: true }).click()
    await expect.poll(() => window.evaluate(() => window.localStorage.getItem('llm-aggregator.contentZoom'))).toBe('115')

    await window.keyboard.press('Control+K')
    await window.getByText('Reset Content Zoom', { exact: true }).click()
    await expect.poll(() => window.evaluate(() => window.localStorage.getItem('llm-aggregator.contentZoom'))).toBe('100')
  })
})
