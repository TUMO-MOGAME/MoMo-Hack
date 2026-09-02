import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Coverage thresholds are deliberately uneven (docs/04 §12). Uniform targets
 * waste effort: `src/domain` is pure and cheap to test AND it is the money, so
 * it carries 95%. UI is covered by E2E instead.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  /**
   * `tsconfig.json` sets `jsx: "preserve"`, which Next.js requires — Next does
   * its own JSX transform. Vite reads that setting and therefore handed `.tsx`
   * through untransformed, so under vitest 4 every component test died at import
   * with "content contains invalid JS syntax" — 5 files, 84 tests, silently not
   * running while the run still reported 231 passing. Under vitest 2 it happened
   * to work; nothing about our code changed.
   *
   * So transform JSX for TESTS ONLY, leaving `tsconfig.json` exactly as Next
   * wants it. The key is `oxc` and not `esbuild` because vitest 4 ships Vite 8,
   * which transforms with oxc — an `esbuild` block here is silently ignored.
   * `automatic` matches React 19, so no file has to import React to be testable.
   */
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'react' },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/server/**', 'src/lib/**'],
      exclude: ['src/lib/agent/mock.ts', '**/*.d.ts'],
      thresholds: {
        'src/domain/**': { lines: 95, functions: 95, branches: 90 },
        'src/lib/momo/**': { lines: 90, functions: 90, branches: 80 },
      },
    },
  },
});
