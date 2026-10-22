import js from '@eslint/js'
import globals from 'globals'

const UNSAFE_HTML = 'Build DOM with h()/svg() from src/tab/core/dom.js; never assign HTML strings.'

export default [
  { ignores: ['dist/**', 'node_modules/**', 'docs/**', 'src/assets/**', 'scripts/**', 'src/shared/config*.js', 'src/shared/firebase.config*.js'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'cloudflare-worker/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.serviceworker, chrome: 'readonly' }
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-throw-literal': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
      'no-restricted-properties': ['error',
        { property: 'innerHTML', message: UNSAFE_HTML },
        { property: 'outerHTML', message: UNSAFE_HTML },
        { property: 'insertAdjacentHTML', message: UNSAFE_HTML }
      ],
      'no-restricted-syntax': ['error',
        { selector: "MemberExpression[object.name='store'][property.name='_state']", message: 'Mutate the store only through its methods.' }
      ]
    }
  },
  {
    files: ['**/__tests__/**/*.js'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-restricted-syntax': 'off', 'no-restricted-properties': 'off' }
  }
]
