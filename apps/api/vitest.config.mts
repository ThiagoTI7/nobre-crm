import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Testes de integração compartilham o mesmo banco: rodam em série.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
