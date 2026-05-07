// src/lib/quiz/score.ts
//
// Pure helper: maps a Record<questionId, Verdict> to a fractional score
// per D-69's locked verdict→score table. Used by QuizRunner.svelte's
// finish() handler. No side effects; no imports beyond the project type seam.
//
// CONTRACT (D-69):
//   correct       -> 1.0
//   incorrect     -> 0.0
//   self-correct  -> 1.0
//   self-partial  -> 0.5
//   self-missed   -> 0.0
//
// Pass-threshold check (QUIZ-08) is the caller's responsibility — this helper
// only computes the per-attempt score; the caller compares against
// assessment.passThreshold (chapter quiz 0.7, part test 0.75, final exam 0.8).
//
// Phase 7 will Vitest this directly — keep it pure.

import type { Verdict } from '~/lib/types';

const VERDICT_TO_SCORE: Record<Verdict, number> = {
  'correct':       1.0,
  'incorrect':     0.0,
  'self-correct':  1.0,
  'self-partial':  0.5,
  'self-missed':   0.0,
};

export function scoreFromVerdicts(perQuestion: Record<string, Verdict>): number {
  const verdicts = Object.values(perQuestion);
  if (verdicts.length === 0) return 0;
  const sum = verdicts.reduce((acc, v) => acc + VERDICT_TO_SCORE[v], 0);
  return sum / verdicts.length;
}
