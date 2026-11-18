import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json. Requires Vite 8.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    // Services log through pino; keep unit-test output quiet.
    env: { LOG_LEVEL: 'silent' },
    root: './',
    include: ['**/*.spec.ts'],
  },
});
