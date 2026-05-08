// src/lib/quiz/chapterBreakdown.ts
//
// Pure helper: groups questions + verdicts + answers into per-chapter rows for
// the final-exam ReviewScreen accordion (D-97.2). Rows are returned ONLY for
// chapters that contributed at least one question to the attempt — the empty-
// chapter filter is the contract (UI-SPEC §Empty/Error/Loading).
//
// CONTRACT (D-97.2 + UI-SPEC §Per-chapter accordion):
//   - One row per chapter with at least one question
//   - Rows ordered by chapterId ascending (lexical sort matches ch01..ch16)
//   - correct = count of questions in this chapter whose verdict is
//     'correct' or 'self-correct'
//   - questionRows preserves the original questions[] order within the chapter
//
// Phase 7 will Vitest this directly — keep it pure (no DOM, no content
// collection imports).

import type { Question, Answer, Verdict } from '~/lib/types';

export interface ChapterRow {
  chapterId: string;
  title: string;
  correct: number;
  total: number;
  questionRows: Array<{
    q: Question;
    verdict: Verdict | null;                       // null when this attempt skipped the question
    answer: Answer | null;
  }>;
}

export function chapterBreakdownFromVerdicts(
  perQuestion: Record<string, Verdict>,
  questions: Question[],
  chapterTitles: Record<string, string>,
  answers: (Answer | null)[],
): ChapterRow[] {
  // Group by chapterId, preserving insertion order (questions[] is the canonical order).
  const groups = new Map<string, Question[]>();
  for (const q of questions) {
    const list = groups.get(q.chapterId) ?? [];
    list.push(q);
    groups.set(q.chapterId, list);
  }
  const rows: ChapterRow[] = [];
  for (const [chapterId, qs] of groups) {
    const questionRows = qs.map((q) => {
      const idx = questions.indexOf(q);
      const v = perQuestion[q.id] ?? null;
      return { q, verdict: v, answer: answers[idx] ?? null };
    });
    const correct = questionRows.filter((r) => r.verdict === 'correct' || r.verdict === 'self-correct').length;
    rows.push({
      chapterId,
      title: chapterTitles[chapterId] ?? chapterId,    // graceful fallback when title missing
      correct,
      total: questionRows.length,
      questionRows,
    });
  }
  // Sort by chapterId ascending so ch01..ch16 render top-to-bottom.
  rows.sort((a, b) => a.chapterId.localeCompare(b.chapterId));
  return rows;
}
