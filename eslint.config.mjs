// Flat ESLint config (ESLint 9). Replaces the legacy .eslintrc.cjs — required
// because eslint-plugin-vue v10 ships only flat-style configs.
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-electron/**',
      'node_modules/**',
      '**/*.js', // compiled output / config shims (source is .ts/.mts/.vue)
      '**/*.snap',
      'tests/visual/**/*-snapshots/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],

  // .vue files: vue-eslint-parser drives, with the TS parser for <script lang="ts">.
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
  },

  // Shared language options (browser + node globals for a mixed Electron codebase).
  {
    files: ['**/*.{ts,mts,cts,tsx,vue,mjs,cjs}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // Match the project's established conventions (previously encoded via the
      // legacy @typescript-eslint/recommended eslintrc extend):
      // `any` is tolerated where interop demands it, and `_`-prefixed args/vars
      // are intentional placeholders.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  // Tests and build scripts use looser conventions (CommonJS require, Playwright
  // fixture destructuring, etc.).
  {
    files: ['tests/**', 'scripts/**'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-empty-pattern': 'off',
    },
  },
)
