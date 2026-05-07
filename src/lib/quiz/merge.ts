// src/lib/quiz/merge.ts
//
// Pure helper: merges a fresh AttemptRecord into existing ProgressV1, honoring
// PROG-02 (best preserved if higher; recent[] keeps last 5 newest-first).
// Used by QuizRunner.svelte's finish() handler. Side-effect-free.
//
// CONTRACT (PROG-02):
//   - existing.assessments[id]?.best wins iff its score > attempt.score
//     (the >= ensures a new equal-best attempt also keeps the latest reference
//     for tie-breaks — newer wins on tie)
//   - recent[] is [attempt, ...prior.recent].slice(0, 5) — newest first, max 5
//   - first-ever attempt for an assessment seeds both `best` and `recent[0]`
//     with the same record
//
// Phase 7 will Vitest this directly — keep it pure (no localStorage, no DOM).

import type { ProgressV1, AttemptRecord, AssessmentProgress } from '~/lib/types';

export function mergeAttempt(
  existing: ProgressV1,
  assessmentId: string,
  attempt: AttemptRecord,
): ProgressV1 {
  const prior = existing.assessments[assessmentId];
  const next: AssessmentProgress = prior === undefined
    ? { best: attempt, recent: [attempt] }
    : {
        best: attempt.score >= prior.best.score ? attempt : prior.best,
        recent: [attempt, ...prior.recent].slice(0, 5),
      };
  return {
    version: 1,
    assessments: { ...existing.assessments, [assessmentId]: next },
  };
}
