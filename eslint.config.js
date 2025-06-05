import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import nodePlugin from 'eslint-plugin-n';
import promisePlugin from 'eslint-plugin-promise';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '.cache/**',
      '.next/**',
      '.nuxt/**',
      '*.log',
      'pnpm-lock.yaml',
      'package-lock.json',
      'yarn.lock',
      '*.config.{js,ts}',
      'eslint.config.js',
    ],
  },
  {
    files: ['src/**/*.{js,mjs,cjs,ts}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'import': importPlugin,
      'n': nodePlugin,
      'promise': promisePlugin,
    },
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': [
        'error',
        { 
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-inferrable-types': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/prefer-as-const': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      '@typescript-eslint/consistent-indexed-object-style': ['error', 'record'],
      '@typescript-eslint/method-signature-style': ['error', 'property'],

      // General code quality
      'prefer-const': 'error',
      'no-var': 'error',
      'no-console': 'off',
      'no-debugger': 'warn',
      'no-duplicate-imports': 'error',
      'no-unused-expressions': 'error',
      'no-useless-return': 'error',
      'no-useless-concat': 'error',
      'prefer-template': 'error',
      'prefer-destructuring': 'error',
      'object-shorthand': 'error',
      'consistent-return': 'error',
      'default-case': 'error',
      'default-case-last': 'error',
      'eqeqeq': ['error', 'always'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-param-reassign': 'error',
      'no-shadow': 'off', // Turn off base rule
      '@typescript-eslint/no-shadow': 'error',
      'no-throw-literal': 'off', // Turn off base rule


      // Async/Promise handling
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/promise-function-async': 'warn',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'warn',

      // Style consistency
      'camelcase': 'off', // Let TypeScript handle this
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'variableLike',
          format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
        },
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        {
          selector: 'interface',
          format: ['PascalCase'],
          custom: {
            regex: '^I[A-Z]',
            match: false,
          },
        },
      ],

      // Import/Export rules
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/no-unused-modules': 'warn',
      'import/no-deprecated': 'warn',
      'import/no-duplicates': 'off',
      'import/no-self-import': 'error',
      'import/no-cycle': 'error',

      // Promise rules
      'promise/always-return': 'warn',
      'promise/catch-or-return': 'warn',
      'promise/no-nesting': 'warn',
      'promise/no-promise-in-callback': 'warn',
      'promise/prefer-await-to-then': 'warn',

      // Node.js rules
      'n/no-unsupported-features/es-syntax': 'off', // TypeScript handles this
      'n/no-unsupported-features/node-builtins': 'error',
      'n/no-deprecated-api': 'error',

      // Security
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',

      // Turn off base rules that are covered by TypeScript
      'no-undef': 'off',
      'no-dupe-class-members': 'off',
      'no-redeclare': 'off',
    },
  },
  {
    files: ['**/*.test.{js,ts}', '**/*.spec.{js,ts}', 'tests/**/*'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-magic-numbers': 'off',
      'max-lines-per-function': 'off',
    },
  },
  {
    files: ['**/*.config.{js,ts}', '**/*.config.*.{js,ts}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-magic-numbers': 'off',
    },
  },
  prettier, // Must be last to override other configs
]; 