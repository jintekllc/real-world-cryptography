// tests/e2e/chapter-quiz.spec.ts
//
// TEST-03: full chapter-quiz flow — visit chapter → answer all questions →
// submit → see score → reload → see persisted progress → click reset →
// confirm progress cleared.
//
// Uses the hello-crypto-quiz fixture (assessment id 'hello-crypto-quiz') as
// the test target because it's the only quiz known to be present at every
// phase of CI (Phase 2 fixture, never out of date).
//
// QUESTION COUNT: the hello-crypto-quiz fixture has EXACTLY 4 questions
// (mc, tf, short, code-autograde) — see
// src/content/assessments/hello-crypto-quiz.json. The plan-template assumed 5;
// per RESEARCH §A2 the count is trivially adjusted at the spec level. Loop
// bounds + the "Question N of 4" regex below reflect the real fixture.
//
// LOCATOR STRATEGY: prefer user-visible roles + text over CSS class hooks.
// The QuizRunner shell emits semantic elements (<fieldset>, <legend>,
// <input type="radio">, <button>) so role-based locators are reliable and
// survive copy edits. No data-testid hooks added to source.
//
// PERSISTENCE VERIFICATION: hello-crypto-quiz is filtered OUT of the cohort-
// facing /chapters/ and /assessments/ index pages (it's a ch00 fixture; see
// src/pages/chapters/index.astro D-49 + src/pages/assessments/index.astro
// D-96.2). That means no [data-rwc-badge="hello-crypto-quiz"] slot appears on
// either index page — the plan-template's badge-visibility check was
// structurally impossible against this fixture. We instead verify persistence
// via TWO assertions: (1) localStorage round-trip (Step 4), and (2) the
// /reset/ page summary text counting the persisted attempt (Step 5) —
// which proves the cohort-visible UI on the next page-load reads the
// persisted state through the same chokepoint a future cohort visit would.

import { test, expect } from '@playwright/test';

const TOTAL = 4;

test.describe('Chapter quiz flow: hello-crypto-quiz', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test for hermetic state.
    //
    // URL NOTE: page.goto() resolves paths against the configured baseURL via
    // the WHATWG URL parser. An absolute path (leading '/') replaces the
    // baseURL pathname entirely — so '/assessments/...' would hit
    // http://localhost:4321/assessments/... and miss the GitHub Pages base
    // path. Use RELATIVE paths (no leading slash) so the base
    // '/real-world-cryptography/' is preserved. Empty-string goto() lands on
    // the baseURL root.
    await page.goto('');
    await page.evaluate(() => localStorage.clear());
  });

  test('answer all questions, see score, reload, see persisted progress, reset clears it', async ({ page }) => {
    // Step 1 — navigate to the quiz page
    await page.goto('assessments/hello-crypto-quiz/');
    await expect(page.getByRole('heading', { name: /quiz/i }).first()).toBeVisible();

    // Step 2 — answer each question in sequence
    for (let q = 1; q <= TOTAL; q++) {
      await expect(page.getByText(new RegExp(`Question ${q} of ${TOTAL}`))).toBeVisible();

      // First option for MC/TF; type 'a' for short/code (autograde will fail
      // grading but still produces a Verdict — that's enough for the flow).
      const radios = page.getByRole('radio');
      if ((await radios.count()) > 0) {
        await radios.first().check();
      } else {
        const textbox = page.getByRole('textbox').first();
        await textbox.fill('a');
      }

      await page.getByRole('button', { name: 'Check answer' }).click();

      // After grading: self-grade widget appears for short + non-autograde code.
      // For mc/tf and autograde-code the advance button appears directly.
      const selfGrade = page.getByRole('button', { name: /got it/i });
      if (await selfGrade.isVisible({ timeout: 500 }).catch(() => false)) {
        await selfGrade.click();
      }

      const advance =
        q < TOTAL
          ? page.getByRole('button', { name: 'Next →' })
          : page.getByRole('button', { name: 'Finish →' });
      await expect(advance).toBeVisible();
      await advance.click();
    }

    // Step 3 — review screen visible with a verdict heading
    await expect(page.getByRole('heading', { name: /PASSED|DID NOT PASS/ })).toBeVisible();

    // Step 4 — localStorage has the progress key with this attempt
    const progress = await page.evaluate(() => localStorage.getItem('rwc:progress:v1'));
    expect(progress, 'rwc:progress:v1 should be populated after submit').not.toBeNull();
    const parsed = JSON.parse(progress!);
    expect(parsed.version).toBe(1);
    expect(parsed.assessments['hello-crypto-quiz']).toBeDefined();
    expect(parsed.assessments['hello-crypto-quiz'].recent.length).toBe(1);

    // Step 5 — reload and verify persistence reaches the cohort-visible UI on
    // the next page-load. /reset/ is the cohort-visible surface that reads the
    // persisted attempt count through safeRead — its summary text is the
    // user-facing manifestation of "your progress was saved across reload."
    await page.reload();
    await page.goto('reset/');
    await page.getByRole('button', { name: /reset progress/i }).click();
    // Confirmation panel shows summary derived from persisted state.
    await expect(page.getByRole('heading', { name: /confirm reset/i })).toBeVisible();
    await expect(page.getByText(/1 quiz attempts? will be cleared/i)).toBeVisible();

    // Step 6 — confirm the wipe
    await page.getByRole('button', { name: /yes, wipe/i }).click();
    await expect(page.getByRole('heading', { name: /progress cleared/i })).toBeVisible();

    // Step 7 — localStorage no longer has the assessment record
    const cleared = await page.evaluate(() => localStorage.getItem('rwc:progress:v1'));
    expect(cleared).toBeNull();
  });

  test('retake flow restarts the quiz at question 1', async ({ page }) => {
    await page.goto('assessments/hello-crypto-quiz/');
    // Speed-run: pick first option for all questions.
    for (let q = 1; q <= TOTAL; q++) {
      const radios = page.getByRole('radio');
      if ((await radios.count()) > 0) await radios.first().check();
      else await page.getByRole('textbox').first().fill('a');
      await page.getByRole('button', { name: 'Check answer' }).click();
      const selfGrade = page.getByRole('button', { name: /got it/i });
      if (await selfGrade.isVisible({ timeout: 500 }).catch(() => false)) {
        await selfGrade.click();
      }
      const advance =
        q < TOTAL
          ? page.getByRole('button', { name: 'Next →' })
          : page.getByRole('button', { name: 'Finish →' });
      await advance.click();
    }
    // On the review screen: click Retake →
    await page.getByRole('button', { name: 'Retake →' }).click();
    await expect(page.getByText(`Question 1 of ${TOTAL}`)).toBeVisible();
  });
});
