// ESLint flat config.
//
// There was no ESLint configuration in this repository at all. `npm run lint`
// ran `next lint`, which, finding nothing to read, dropped into an INTERACTIVE
// setup prompt — so it could never pass in CI, and `npm run verify` (session
// checklist step 4) could never complete either. Both were quietly broken.
//
// `eslint-config-next` 15.5 still ships the legacy eslintrc format, so it is
// bridged through FlatCompat rather than spread directly.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';
import prettier from 'eslint-config-prettier';

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const config = [
  {
    // Build output and vendored code are not ours to lint.
    ignores: ['.next/**', 'out/**', 'build/**', 'coverage/**', 'node_modules/**', 'next-env.d.ts'],
  },

  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  {
    rules: {
      // An unused variable is usually a half-finished thought. `_`-prefixed
      // names are the documented way to say "deliberately ignored".
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  {
    // Tests reach into internals and assert on shapes the compiler cannot see.
    files: ['tests/**/*.ts', 'tests/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  {
    // Scripts are Node utilities, not part of the Next application.
    files: ['scripts/**/*.mjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // LAST, and it must stay last. This switches OFF every ESLint rule that
  // overlaps with Prettier, so the two cannot disagree about the same line —
  // otherwise you get files that `npm run lint` and `npm run format:check` both
  // fail, each demanding the other's output. Anything added after this would
  // re-enable the rules it just turned off.
  prettier,
];

export default config;
