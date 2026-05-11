// tests/e2e/production-smoke.spec.ts
//
// Loop over every route the static build emits and assert:
//   1. The route returns 200 (page.goto resolves and response.ok())
//   2. No console errors during page load
//   3. No critical axe violations (quick a11y safety net)
//
// This is the final gate before publish. If any route fails, abort the deploy.
//
// Route enumeration mirrors scripts/gates.sh G6 (REQUIRED_FIXED_ROUTES +
// per-chapter loop ch01..ch16 + ch00 detail). Total: 12 cross-cutting +
// 48 chapter-derived (ch01..ch16 × {detail, quiz, challenge}) + 1 ch00 detail
// = 61 routes. If G6 evolves, update this loop to match.
//
// URL NOTE: page.goto() resolves relative paths against the configured
// baseURL (`http://localhost:4321/real-world-cryptography/`). Use RELATIVE
// paths (no leading slash) so the GitHub Pages base path is preserved.
// (Same convention as chapter-quiz.spec.ts and accessibility.spec.ts.)

import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

type Route = { path: string; label: string };

const ROUTES: Route[] = [
  // Cross-cutting (12) — hand-listed; mirrors REQUIRED_FIXED_ROUTES in
  // scripts/gates.sh G6.
  { path: '', label: 'Homepage' },
  { path: 'chapters/', label: 'Chapter index' },
  { path: 'assessments/', label: 'Assessments index' },
  { path: 'assessments/part-1-required/', label: 'Part 1 required' },
  { path: 'assessments/part-1-challenge/', label: 'Part 1 challenge' },
  { path: 'assessments/part-2-required/', label: 'Part 2 required' },
  { path: 'assessments/part-2-challenge/', label: 'Part 2 challenge' },
  { path: 'assessments/final-exam/', label: 'Final exam interstitial' },
  { path: 'assessments/final-exam/start/', label: 'Final exam runner' },
  { path: 'assessments/hello-crypto-quiz/', label: 'Hello-crypto quiz' },
  { path: 'coding-project/', label: 'Coding project' },
  { path: 'reset/', label: 'Reset progress' },
];

// Per-cohort-chapter (ch01..ch16): detail + quiz + challenge = 48 routes.
for (let i = 1; i <= 16; i++) {
  const ch = `ch${String(i).padStart(2, '0')}`;
  ROUTES.push(
    { path: `chapters/${ch}/`, label: `Chapter ${ch} detail` },
    { path: `assessments/${ch}-quiz/`, label: `Chapter ${ch} quiz` },
    { path: `assessments/${ch}-challenge/`, label: `Chapter ${ch} challenge` },
  );
}
// ch00 detail (excluded from quiz/challenge enumeration per D-49 — its quiz
// is the hello-crypto-quiz fixture above).
ROUTES.push({ path: 'chapters/ch00/', label: 'Hello-crypto chapter detail' });

test.describe('Production smoke: every emitted route loads cleanly', () => {
  for (const route of ROUTES) {
    // Path label can be empty string (homepage) — display '/' in the test name
    // for readability.
    const display = route.path === '' ? '/' : `/${route.path}`;
    test(`${route.label} (${display})`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      const response = await page.goto(route.path);
      expect(response, `${display}: page.goto returned null`).not.toBeNull();
      expect(
        response!.ok(),
        `${display}: response status ${response!.status()}`,
      ).toBe(true);
      expect(
        consoleErrors,
        `${display}: console errors: ${consoleErrors.join(', ')}`,
      ).toEqual([]);

      // Lightweight axe pass: critical violations only (smoke speed > coverage).
      // accessibility.spec.ts handles the deeper critical+serious sweep on the
      // highest-risk surfaces; here we just catch the worst regressions
      // (missing alt text, broken landmarks, etc.) across the whole site.
      const results = await new AxeBuilder({ page }).analyze();
      const critical = results.violations.filter((v) => v.impact === 'critical');
      expect(
        critical,
        `${display}: critical axe violations: ${JSON.stringify(critical)}`,
      ).toEqual([]);
    });
  }
});
