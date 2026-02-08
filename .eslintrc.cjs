module.exports = {
  root: true,
  env: {
    browser: true,
    es2020: true,
    node: true, // Add Node.js globals
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:vue/vue3-recommended',
  ],
  ignorePatterns: [
    'dist',
    'dist-electron', // Ignore build output
    '.eslintrc.cjs',
    '*.js' // Ignore compiled JS files
  ],
  parser: 'vue-eslint-parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parser: '@typescript-eslint/parser',
  },
  plugins: ['@typescript-eslint'],
  rules: {
    // Add any custom rules here
  },
}