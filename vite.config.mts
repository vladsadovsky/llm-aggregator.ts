import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
const __dirname = fileURLToPath(new URL('.', import.meta.url))

function onRollupWarn(warning: { code?: string; id?: string | null }, warn: (warning: unknown) => void) {
  // Suppress known third-party warning from gray-matter's JS engine loader.
  if (warning.code === 'EVAL' && warning.id?.includes('node_modules/gray-matter/lib/engines.js')) {
    return
  }
  warn(warning)
}

/**
 * Split the renderer's third-party code away from app code (issue #7).
 *
 * The whole app used to ship as one ~1.7 MB chunk that had to be parsed before
 * anything rendered. Splitting does not reduce total bytes — the curated
 * highlight.js language list in `src/utils/highlightLanguages.ts` is what does
 * that — but it lets the browser parse these in parallel and keeps a vendor
 * chunk stable across app-code edits.
 *
 * Keyed on path fragments rather than bare package names so a nested
 * dependency (e.g. `node_modules/primevue/node_modules/...`) still lands in the
 * right bucket.
 */
function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined
  if (id.includes('highlight.js')) return 'vendor-highlight'
  // The Aura design-token set is its own ~200 kB and changes independently of
  // the component code, so it earns a separate chunk.
  if (id.includes('@primeuix')) return 'vendor-primevue-theme'
  if (id.includes('primevue')) return 'vendor-primevue'
  if (id.includes('markdown-it') || id.includes('turndown') || id.includes('entities')) {
    return 'vendor-markdown'
  }
  if (id.includes('/vue/') || id.includes('@vue/') || id.includes('pinia')) return 'vendor-vue'
  return 'vendor'
}

export default defineConfig({
  build: {
    rollupOptions: {
      output: { manualChunks },
    },
  },
  plugins: [
    vue(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'fs', 'path', 'os'],
              onwarn: onRollupWarn,
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
              onwarn: onRollupWarn,
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
