import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      // Map the Workers-only module to a local mock for tests.
      'cloudflare:email': fileURLToPath(
        new URL('./test/mocks/cloudflare-email.js', import.meta.url)
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
