import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: { alias: { "server-only": new URL("./tests/server-only-stub.ts", import.meta.url).pathname } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          // Each file resets fixtures in its own transaction-free schema; run serially.
          fileParallelism: false,
          testTimeout: 30_000,
        },
      },
    ],
  },
})
