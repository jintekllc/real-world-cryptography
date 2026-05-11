// src/lib/grader.test.ts
//
// TEST-01 — Unit tests for StaticGrader covering every Verdict outcome
// across the four Question kinds (mc / tf / short / code) plus the two
// code-question subpaths (autoGrade=true vs self-grade fallback).
//
// Coverage targets (verified by `pnpm test:coverage`):
//   - mc: correct, incorrect, kind-mismatch throws
//   - tf: correct, incorrect, kind-mismatch throws
//   - short: self-correct, self-partial, self-missed, kind-mismatch throws
//   - code/auto: correct (exact + normalized variants), incorrect,
//     normalization-echo (result.normalized populated)
//   - code/self: self-correct verdict, missing-selfVerdict throws,
//     kind-mismatch throws
//
// Fixtures are constructed inline so the suite is decoupled from
// content collection state (Astro's astro:content virtual module is
// not hydrated under Vitest — direct JSON imports would work, but
// inline fixtures keep the tests minimal and the schemas honest).

import { describe, it, expect } from 'vitest';
import { StaticGrader, grader } from './grader';
import type { Answer } from './grader';
import type { Question } from '~/content.config';

// ----- Inline fixtures (cast at the call site via `as unknown as Question`).
// Only the fields the runtime grader reads (kind, answerIndex/answer/
// referenceAnswer, autoGrade, explanation) need to be present — the full
// schema fidelity is enforced by astro:content at build time, not here.

const mcQ = {
  id: 'ch00-q01',
  chapterId: 'ch00',
  kind: 'mc' as const,
  prompt: 'pick A',
  choices: ['A', 'B', 'C', 'D'],
  answerIndex: 0,
  explanation: 'because A',
};

const tfQ = {
  id: 'ch00-q02',
  chapterId: 'ch00',
  kind: 'tf' as const,
  prompt: 'AES-128 uses 14 rounds.',
  answer: false,
  explanation: 'AES-128 uses 10 rounds.',
};

const shortQ = {
  id: 'ch00-q03',
  chapterId: 'ch00',
  kind: 'short' as const,
  prompt: 'Explain ECB weakness.',
  modelAnswer: 'ECB encrypts identical blocks identically.',
  rubric: ['identical blocks', 'pattern leakage', 'determinism'],
  explanation: 'penguin demo',
};

const codeAutoQ = {
  id: 'ch00-q04',
  chapterId: 'ch00',
  kind: 'code' as const,
  prompt: 'SHA-256 of empty string?',
  referenceAnswer:
    '0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  autoGrade: true as const,
  normalization: { lowercase: true, strip0x: true, stripWhitespace: true },
  explanation: 'fixed constant',
};

const codeSelfQ = {
  id: 'ch00-q05',
  chapterId: 'ch00',
  kind: 'code' as const,
  prompt: 'Explain the GCM tag-length tradeoff.',
  referenceAnswer:
    'The tag length trades collision resistance against bandwidth.',
  // autoGrade absent → self-grade path
  explanation: 'self-graded code',
};

describe('StaticGrader', () => {
  // ===================================================================
  // mc
  // ===================================================================
  describe('mc', () => {
    it('correct selected index returns verdict "correct" and echoes explanation', async () => {
      const r = await grader.grade(
        mcQ as unknown as Question,
        { kind: 'mc', selected: 0 },
      );
      expect(r.verdict).toBe('correct');
      expect(r.explanation).toBe('because A');
    });

    it('wrong selected index returns verdict "incorrect"', async () => {
      const r = await grader.grade(
        mcQ as unknown as Question,
        { kind: 'mc', selected: 1 },
      );
      expect(r.verdict).toBe('incorrect');
      expect(r.explanation).toBe('because A');
    });

    it("answer.kind mismatch throws /does not match question kind 'mc'/", async () => {
      await expect(
        grader.grade(
          mcQ as unknown as Question,
          { kind: 'tf', selected: true } as unknown as Answer,
        ),
      ).rejects.toThrow(/does not match question kind 'mc'/);
    });
  });

  // ===================================================================
  // tf
  // ===================================================================
  describe('tf', () => {
    it('correct selected matches answer → "correct"', async () => {
      const r = await grader.grade(
        tfQ as unknown as Question,
        { kind: 'tf', selected: false },
      );
      expect(r.verdict).toBe('correct');
    });

    it('wrong selected returns "incorrect"', async () => {
      const r = await grader.grade(
        tfQ as unknown as Question,
        { kind: 'tf', selected: true },
      );
      expect(r.verdict).toBe('incorrect');
    });

    it("answer.kind mismatch throws /does not match question kind 'tf'/", async () => {
      await expect(
        grader.grade(
          tfQ as unknown as Question,
          { kind: 'mc', selected: 0 } as unknown as Answer,
        ),
      ).rejects.toThrow(/does not match question kind 'tf'/);
    });
  });

  // ===================================================================
  // short (always self-graded)
  // ===================================================================
  describe('short', () => {
    it('selfVerdict "self-correct" → "self-correct"', async () => {
      const r = await grader.grade(shortQ as unknown as Question, {
        kind: 'short',
        text: 'ECB leaks block patterns.',
        selfVerdict: 'self-correct',
      });
      expect(r.verdict).toBe('self-correct');
      expect(r.explanation).toBe('penguin demo');
    });

    it('selfVerdict "self-partial" → "self-partial"', async () => {
      const r = await grader.grade(shortQ as unknown as Question, {
        kind: 'short',
        text: 'something about ECB',
        selfVerdict: 'self-partial',
      });
      expect(r.verdict).toBe('self-partial');
    });

    it('selfVerdict "self-missed" → "self-missed"', async () => {
      const r = await grader.grade(shortQ as unknown as Question, {
        kind: 'short',
        text: 'no idea',
        selfVerdict: 'self-missed',
      });
      expect(r.verdict).toBe('self-missed');
    });

    it("answer.kind mismatch throws /does not match question kind 'short'/", async () => {
      await expect(
        grader.grade(
          shortQ as unknown as Question,
          { kind: 'mc', selected: 0 } as unknown as Answer,
        ),
      ).rejects.toThrow(/does not match question kind 'short'/);
    });
  });

  // ===================================================================
  // code / autoGrade=true
  // ===================================================================
  describe('code (autoGrade)', () => {
    it('exact match returns "correct" and echoes normalized form', async () => {
      const r = await grader.grade(codeAutoQ as unknown as Question, {
        kind: 'code',
        text: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      });
      expect(r.verdict).toBe('correct');
      expect(r.normalized).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      );
      expect(r.explanation).toBe('fixed constant');
    });

    it('mismatched answer returns "incorrect" (normalized still echoed)', async () => {
      const r = await grader.grade(codeAutoQ as unknown as Question, {
        kind: 'code',
        text: 'deadbeef',
      });
      expect(r.verdict).toBe('incorrect');
      expect(r.normalized).toBe('deadbeef');
    });

    it('normalization (lowercase + strip0x + stripWhitespace) treats variants as equal', async () => {
      const refQ = {
        id: 'ch00-qXX',
        chapterId: 'ch00',
        kind: 'code' as const,
        prompt: 'deadbeef?',
        referenceAnswer: '0xdeadbeef',
        autoGrade: true as const,
        normalization: {
          lowercase: true,
          strip0x: true,
          stripWhitespace: true,
        },
      } as unknown as Question;

      for (const variant of ['0xDEADBEEF', ' deadbeef ', 'DEAD BEEF', '0xDEAD BEEF']) {
        const r = await grader.grade(refQ, { kind: 'code', text: variant });
        expect(r.verdict, `variant=${variant}`).toBe('correct');
        expect(r.normalized, `variant=${variant}`).toBe('deadbeef');
      }
    });

    it("answer.kind mismatch throws /does not match question kind 'code'/", async () => {
      await expect(
        grader.grade(
          codeAutoQ as unknown as Question,
          { kind: 'mc', selected: 0 } as unknown as Answer,
        ),
      ).rejects.toThrow(/does not match question kind 'code'/);
    });
  });

  // ===================================================================
  // code / self-graded fallback (autoGrade absent)
  // ===================================================================
  describe('code (self-graded fallback)', () => {
    it('selfVerdict "self-correct" propagates', async () => {
      const r = await grader.grade(codeSelfQ as unknown as Question, {
        kind: 'code',
        text: 'longer tag = stronger MAC, costs bandwidth',
        selfVerdict: 'self-correct',
      });
      expect(r.verdict).toBe('self-correct');
    });

    it('missing selfVerdict throws /autoGrade absent, selfVerdict required/', async () => {
      await expect(
        grader.grade(codeSelfQ as unknown as Question, {
          kind: 'code',
          text: 'something',
        }),
      ).rejects.toThrow(/autoGrade absent, selfVerdict required/);
    });
  });

  // ===================================================================
  // Construct-direct sanity (verifies the exported singleton is the
  // same shape as a fresh StaticGrader instance)
  // ===================================================================
  it('StaticGrader can be instantiated directly and behaves identically', async () => {
    const local = new StaticGrader();
    const r = await local.grade(
      mcQ as unknown as Question,
      { kind: 'mc', selected: 0 },
    );
    expect(r.verdict).toBe('correct');
  });
});
