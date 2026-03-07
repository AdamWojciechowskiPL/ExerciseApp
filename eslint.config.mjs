export default [
  {
    ignores: ['node_modules/**', '.netlify/**', '.next/**', '.cache/**', 'coverage/**']
  },
  {
    files: ['tests/smoke/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        require: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['error', { args: 'after-used', vars: 'all', argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-unreachable': 'error'
    }
  },
  {
    files: ['shared/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['error', { args: 'after-used', vars: 'all', argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-unreachable': 'error'
    }
  }
];
