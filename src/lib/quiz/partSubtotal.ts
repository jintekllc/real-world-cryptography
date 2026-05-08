// src/lib/quiz/partSubtotal.ts
//
// Pure helper: partitions a verdict map into Part 1 / Part 2 subtotals using a
// chapterToPart lookup that the page shell computes from the chapters
// collection. Used by ReviewScreen.svelte's mode === 'final-exam' branch
// (Plan 05-03).
//
// CONTRACT (D-97.2):
//   - "Correct" predicate: verdict === 'correct' || verdict === 'self-correct'
//     (matches ReviewScreen's existing correctCount derivation; self-partial
//     counts as 0.5 in score but as 0 here — this is the per-question count,
//     not the fractional score).
//   - Questions whose chapterId is missing from chapterToPart are SKIPPED (the
//     map is the source of truth for chapter→part assignment; an unknown chapter
//     is not silently bucketed into Part 1).
//
// Phase 7 will Vitest this directly — keep it pure (no DOM, no content
// collection imports, no globals).

import type { Question, Verdict } from '~/lib/types';

export interface PartSubtotal {
  part1: { correct: number; total: number };
  part2: { correct: number; total: number };
}

export function partSubtotalFromVerdicts(
  perQuestion: Record<string, Verdict>,
  questions: Question[],
  chapterToPart: Record<string, 1 | 2>,
): PartSubtotal {
  const acc: PartSubtotal = {
    part1: { correct: 0, total: 0 },
    part2: { correct: 0, total: 0 },
  };
  for (const q of questions) {
    const part = chapterToPart[q.chapterId];
    if (part !== 1 && part !== 2) continue;       // unknown chapter — skip silently
    const bucket = part === 1 ? acc.part1 : acc.part2;
    bucket.total = bucket.total + 1;
    const v = perQuestion[q.id];
    if (v === 'correct' || v === 'self-correct') {
      bucket.correct = bucket.correct + 1;
    }
  }
  return acc;
}
