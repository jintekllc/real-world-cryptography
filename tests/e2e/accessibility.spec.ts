// tests/e2e/accessibility.spec.ts
//
// axe-core a11y smoke against the three highest-risk surfaces:
//   - Homepage (every cohort lands here)
//   - One chapter detail page (the cohort spends most of their time here)
//   - The exam results / certificate page (rarely visited, easy to miss)
//
// Critical / serious violations FAIL the test. Moderate / minor are logged
// but do not fail — these are typically intentional design decisions.
//
// To allowlist a SPECIFIC rule on a specific page, use .disableRules() —
// document the rationale in a comment so a future audit knows why.
//
// URL NOTE: page.goto() resolves paths against the configured baseURL via
// the WHATWG URL parser. An absolute path (leading '/') replaces the
// baseURL pathname entirely — so '/assessments/...' would hit
// http://localhost:4321/assessments/... and miss the GitHub Pages base
// path. Use RELATIVE paths (no leading slash) so the base
// '/real-world-cryptography/' is preserved. Empty-string goto() lands on
// the baseURL root. (Pattern mirrored from tests/e2e/chapter-quiz.spec.ts.)

import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

const CRITICAL_AND_SERIOUS = ['critical', 'serious'] as const;
type BlockingImpact = (typeof CRITICAL_AND_SERIOUS)[number];

test.describe('axe-core a11y', () => {
  test('homepage has no critical/serious violations', async ({ page }) => {
    await page.goto('');
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (v) => CRITICAL_AND_SERIOUS.includes(v.impact as BlockingImpact),
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });

  test('chapter detail page has no critical/serious violations', async ({ page }) => {
    await page.goto('chapters/ch01/');
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (v) => CRITICAL_AND_SERIOUS.includes(v.impact as BlockingImpact),
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });

  // WR-06: this test always skipped — the final-exam fixture is 16 code +
  // 4 short questions with no MC/TF, so the speed-run (which types 'a' for
  // every text field) cannot reach the 80% pass threshold. The certificate
  // never rendered, axe never ran, and the test paid the cost of a
  // 100-iteration speed-run loop on every CI run for guaranteed-skip
  // verification of nothing.
  //
  // Mark fixme() so the spec does not run until the certificate is reachable
  // through this fixture (either via a content edit that lowers the
  // threshold, or by switching the seed strategy to a deterministic
  // localStorage fixture that hydrates a passing ProgressV1 record before
  // navigating). When that path is built, restore the assertion below and
  // remove the fixme().
  test.fixme(
    'certificate region (post-final-exam-pass) has no critical/serious violations',
    async ({ page }) => {
      const certificate = page.getByRole('region', { name: /completion certificate/i });
      await expect(certificate).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      const blocking = results.violations.filter(
        (v) => CRITICAL_AND_SERIOUS.includes(v.impact as BlockingImpact),
      );
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    },
  );
});
