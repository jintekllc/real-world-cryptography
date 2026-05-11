// vitest.config.ts
//
// Astro 6 + Vitest 4 integration via getViteConfig (Astro testing guide
// authoritative path). getViteConfig reads astro.config.mjs and applies its
// Vite settings (Tailwind v4 plugin, ~/* path alias) to the test environment
// so test code can import '~/lib/grader' the same way source code does.
//
// Two test environments:
//   - 'node':     pure logic (Grader, score, merge). environment: 'node'.
//   - 'happy-dom': storage chokepoint (Plan 07-02). Per-file override via
//                 // @vitest-environment happy-dom pragma.

/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    // Co-located tests under src/, plus tests/unit/ for cross-module suites.
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    exclude: [
      'node_modules/**',
      'dist/**',
      '.astro/**',
      'tests/e2e/**',  // Playwright owns these
    ],
    // Default to node (fast); the happy-dom suite overrides via // @vitest-environment.
    environment: 'node',
    // Reporter: default 'verbose' is too noisy; 'dot' fits CI logs.
    reporters: process.env.CI === 'true' ? ['dot'] : ['default'],
    // Vitest 4 exits 1 when no tests match; Phase 7 Plan 01 Task 1 wants the
    // sanity-run (before any *.test.ts exists) to exit 0 so CI can rely on
    // `pnpm test:unit` as a gate even during the bootstrap window.
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      // Limit coverage to the modules Phase 7 owns; exclude test files + content.
      include: [
        'src/lib/grader.ts',
        'src/lib/progress/**/*.ts',
        'src/lib/quiz/**/*.ts',
        'src/lib/projects/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
      reporter: ['text', 'html'],
    },
  },
});
