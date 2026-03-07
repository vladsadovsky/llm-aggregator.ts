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

export default defineConfig({
  plugins: [
    vue(),
    electron([
      {
        entry: 'electron/main.ts',
        // No-op: Electron is launched by VS Code debugger, not by this plugin
        onstart() {},
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
        // No-op: must not call reload()/startup() or it spawns a second Electron
        onstart() {},
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
