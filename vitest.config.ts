import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'apps/server/tests/**/*.test.ts'],
    testTimeout: 45000,
    hookTimeout: 15000,
  },
});
