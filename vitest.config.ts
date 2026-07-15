import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run tests in Node environment (no browser/DOM needed for our logic tests)
    environment: 'node',
    // Test file patterns
    include: ['tests/**/*.test.ts'],
    // Verbose output so each test name is visible in the report
    reporters: ['verbose'],
    // Coverage (optional — run with --coverage flag)
    coverage: {
      provider: 'v8',
      include: ['lib/**', 'app/api/**'],
      exclude: ['**/*.d.ts', 'node_modules'],
    },
  },
});
