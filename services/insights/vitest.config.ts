import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Integration tests share one database; run files sequentially to keep them independent.
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      TZ: 'UTC',
    },
  },
});
