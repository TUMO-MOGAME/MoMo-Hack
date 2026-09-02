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
