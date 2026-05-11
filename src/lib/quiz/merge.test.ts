// src/lib/quiz/merge.test.ts
//
// TEST-01 — Unit tests for mergeAttempt (PROG-02):
//   - first-ever attempt seeds best + recent[0] from a single record
//   - lower-score follow-up preserves prior best, prepends recent[]
//   - equal-score follow-up REPLACES best (newer wins on tie per the
//     >= comparison in merge.ts)
//   - higher-score follow-up REPLACES best
//   - recent[] caps at 5 newest-first across 7 sequential attempts
//
// The helper is pure — env: 'node' is sufficient.

import { describe, it, expect } from 'vitest';
import { mergeAttempt } from './merge';
import type { ProgressV1, AttemptRecord } from '~/lib/types';

function attempt(
  score: number,
  id = '01TEST',
  completedAt = '2026-05-11T00:00:00.000Z',
): AttemptRecord {
  return {
    attemptId: id,
    completedAt,
    score,
    passed: score >= 0.7,
    perQuestion: { 'ch00-q01': score >= 1.0 ? 'correct' : 'incorrect' },
  };
}

const empty: ProgressV1 = { version: 1, assessments: {} };

describe('mergeAttempt (PROG-02)', () => {
  it('first-ever attempt seeds best and recent[0] from the same record', () => {
    const a = attempt(0.8, '01AAA');
    const next = mergeAttempt(empty, 'hello-crypto-quiz', a);
    expect(next.version).toBe(1);
    expect(next.assessments['hello-crypto-quiz']?.best).toEqual(a);
    expect(next.assessments['hello-crypto-quiz']?.recent).toEqual([a]);
  });

  it('lower-score follow-up preserves prior best, prepends to recent[]', () => {
    const first = attempt(0.8, '01AAA');
    const second = attempt(0.4, '01BBB', '2026-05-11T01:00:00.000Z');
    const after1 = mergeAttempt(empty, 'q', first);
    const after2 = mergeAttempt(after1, 'q', second);
    expect(after2.assessments['q']?.best).toEqual(first);
    expect(after2.assessments['q']?.recent).toEqual([second, first]);
  });

  it('equal-score follow-up replaces best (newer wins on tie)', () => {
    const first = attempt(0.7, '01AAA');
    const second = attempt(0.7, '01BBB', '2026-05-11T01:00:00.000Z');
    const after1 = mergeAttempt(empty, 'q', first);
    const after2 = mergeAttempt(after1, 'q', second);
    expect(after2.assessments['q']?.best).toEqual(second);
  });

  it('higher-score follow-up replaces best', () => {
    const first = attempt(0.6, '01AAA');
    const second = attempt(0.9, '01BBB', '2026-05-11T01:00:00.000Z');
    const after1 = mergeAttempt(empty, 'q', first);
    const after2 = mergeAttempt(after1, 'q', second);
    expect(after2.assessments['q']?.best).toEqual(second);
  });

  it('recent[] caps at 5 newest-first across 7 sequential attempts', () => {
    let prog: ProgressV1 = empty;
    const attempts: AttemptRecord[] = [];
    for (let i = 0; i < 7; i++) {
      const a = attempt(0.5, `01ATT${i}`, `2026-05-11T0${i}:00:00.000Z`);
      attempts.push(a);
      prog = mergeAttempt(prog, 'q', a);
    }
    const recent = prog.assessments['q']?.recent ?? [];
    expect(recent.length).toBe(5);
    expect(recent[0]).toEqual(attempts[6]); // newest first
    expect(recent[4]).toEqual(attempts[2]); // 5th-newest = index 2 in the 7-attempt history
  });

  it('merging into an existing OTHER assessment does not disturb prior keys', () => {
    const a = attempt(0.9, '01QQQ');
    const after1 = mergeAttempt(empty, 'quiz-A', a);
    const b = attempt(0.5, '01RRR');
    const after2 = mergeAttempt(after1, 'quiz-B', b);
    expect(after2.assessments['quiz-A']?.best).toEqual(a);
    expect(after2.assessments['quiz-B']?.best).toEqual(b);
  });
});
