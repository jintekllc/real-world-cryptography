// src/lib/quiz/score.test.ts
//
// TEST-01 — Unit tests for scoreFromVerdicts (D-69 verdict→score table):
//   correct       -> 1.0
//   incorrect     -> 0.0
//   self-correct  -> 1.0
//   self-partial  -> 0.5
//   self-missed   -> 0.0
//
// The helper is pure — env: 'node' is sufficient.

import { describe, it, expect } from 'vitest';
import { scoreFromVerdicts } from './score';
import type { Verdict } from '~/lib/types';

describe('scoreFromVerdicts (D-69)', () => {
  it('empty record returns 0', () => {
    expect(scoreFromVerdicts({})).toBe(0);
  });

  it('all correct returns 1.0', () => {
    expect(scoreFromVerdicts({ a: 'correct', b: 'correct' })).toBe(1.0);
  });

  it('all incorrect returns 0.0', () => {
    expect(scoreFromVerdicts({ a: 'incorrect', b: 'incorrect' })).toBe(0.0);
  });

  it('all self-partial returns 0.5', () => {
    expect(scoreFromVerdicts({ a: 'self-partial', b: 'self-partial' })).toBe(0.5);
  });

  it('all self-correct returns 1.0 (equivalent to all correct)', () => {
    expect(scoreFromVerdicts({ a: 'self-correct', b: 'self-correct' })).toBe(1.0);
  });

  it('all self-missed returns 0.0 (equivalent to all incorrect)', () => {
    expect(scoreFromVerdicts({ a: 'self-missed', b: 'self-missed' })).toBe(0.0);
  });

  it('mixed verdicts average correctly: 1 + 1 + 0 + 0.5 over 4 = 0.625', () => {
    const r: Record<string, Verdict> = {
      a: 'correct',      // 1.0
      b: 'self-correct', // 1.0
      c: 'incorrect',    // 0.0
      d: 'self-partial', // 0.5
    };
    expect(scoreFromVerdicts(r)).toBeCloseTo(0.625, 6);
  });
});
