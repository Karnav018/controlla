import { defineConfig } from 'vitest/config';

// Integration tests boot real servers against shared Redis/Mongo —
// files must run sequentially to avoid cross-test state races.
export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false
  }
});
