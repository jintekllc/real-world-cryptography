// src/lib/grader.ts
//
// Grader interface + v1 StaticGrader (pure functions, switch on kind).
// CONTRACT (D-30, D-31, LIB-02): UI consumers never branch on question.kind
// before calling. They get a typed Question from QuestionSource and pass
// it through grade(). Internal dispatch happens once, here.
//
// Answer (D-32) is a discriminated union mirroring Question.kind.
// GradeResult (D-31) is the unified return shape:
//   { verdict, normalized?, explanation? }
// where verdict is one of:
//   'correct' | 'incorrect' | 'self-correct' | 'self-partial' | 'self-missed'
//
// The normalization function for `code` autoGrade is private to this module
// (D-27 fixed bundle: lowercase + strip0x + stripWhitespace, applied
// together). Phase 4 reads the normalized form via GradeResult.normalized
// (QUIZ-10 — no re-normalization in the UI).

import type { Question } from '~/content.config';

// =============================================================
// Public types (D-31, D-32)
// =============================================================

export type Verdict =
  | 'correct'
  | 'incorrect'
  | 'self-correct'
  | 'self-partial'
  | 'self-missed';

export type Answer =
  | { kind: 'mc'; selected: number }
  | { kind: 'tf'; selected: boolean }
  | { kind: 'short'; text: string; selfVerdict: 'self-correct' | 'self-partial' | 'self-missed' }
  | { kind: 'code'; text: string; selfVerdict?: 'self-correct' | 'self-partial' | 'self-missed' };

export type GradeResult = {
  verdict: Verdict;
  normalized?: string;
  explanation?: string;
};

// =============================================================
// Public interface (D-30 — single polymorphic method)
// =============================================================

/**
 * The polymorphic grading contract. UI consumers call grade() with a typed
 * Question and a matching Answer; internal dispatch on `question.kind`
 * happens once, here. v2 AI milestone (AI-04) can swap this with an async
 * remote grader without touching any call site.
 */
export interface Grader {
  grade(question: Question, answer: Answer): Promise<GradeResult>;
}

// =============================================================
// v1 implementation
// =============================================================

/**
 * StaticGrader — synchronous-in-spirit, async-in-signature pure grader for v1.
 * Dispatches on question.kind exhaustively over the four kinds.
 *
 * Each case body opens with a defensive guard against Answer.kind mismatch.
 * TS narrowing alone would catch most call-site bugs, but the runtime check
 * documents intent and protects Phase 4 islands against runtime construction
 * of mismatched Answer values (e.g., from a deserialized form payload).
 */
export class StaticGrader implements Grader {
  async grade(question: Question, answer: Answer): Promise<GradeResult> {
    switch (question.kind) {
      case 'mc': {
        if (answer.kind !== 'mc') {
          throw new Error(
            `Answer kind '${answer.kind}' does not match question kind 'mc'`,
          );
        }
        const correct = answer.selected === question.answerIndex;
        return makeResult(correct ? 'correct' : 'incorrect', question.explanation);
      }

      case 'tf': {
        if (answer.kind !== 'tf') {
          throw new Error(
            `Answer kind '${answer.kind}' does not match question kind 'tf'`,
          );
        }
        const correct = answer.selected === question.answer;
        return makeResult(correct ? 'correct' : 'incorrect', question.explanation);
      }

      case 'short': {
        if (answer.kind !== 'short') {
          throw new Error(
            `Answer kind '${answer.kind}' does not match question kind 'short'`,
          );
        }
        // D-27: short is ALWAYS self-graded; verdict comes from UI's
        // self-grade widget (Answer.selfVerdict is required for `short`).
        return makeResult(answer.selfVerdict, question.explanation);
      }

      case 'code': {
        if (answer.kind !== 'code') {
          throw new Error(
            `Answer kind '${answer.kind}' does not match question kind 'code'`,
          );
        }
        // D-27: autoGrade => exact-match after normalization.
        if (question.autoGrade === true) {
          const normalized = normalizeCodeAnswer(answer.text);
          const expected = normalizeCodeAnswer(question.referenceAnswer);
          const correct = normalized === expected;
          return makeResult(
            correct ? 'correct' : 'incorrect',
            question.explanation,
            normalized, // D-31: echo for QUIZ-10 (no re-normalize in UI)
          );
        }
        // Fallback: self-grade. selfVerdict is required when autoGrade is absent.
        if (answer.selfVerdict === undefined) {
          throw new Error(
            `code question ${question.id}: autoGrade absent, selfVerdict required`,
          );
        }
        return makeResult(answer.selfVerdict, question.explanation);
      }
    }
  }
}

// =============================================================
// Private helpers
// =============================================================

// Construct a GradeResult that honors exactOptionalPropertyTypes: optional
// fields are OMITTED when undefined (not set to undefined). This avoids the
// ts(2375) compile error on the union type and keeps the wire shape clean
// for serialization downstream (Phase 4 progress writes).
function makeResult(
  verdict: Verdict,
  explanation: string | undefined,
  normalized?: string,
): GradeResult {
  const result: GradeResult = { verdict };
  if (explanation !== undefined) result.explanation = explanation;
  if (normalized !== undefined) result.normalized = normalized;
  return result;
}

// =============================================================
// Private normalization helper (D-27 fixed bundle)
// =============================================================

// D-27: fixed-bundle normalization. ALL three rules apply when autoGrade: true.
//   - lowercase: true       (case-insensitive comparison)
//   - strip0x: true         (drop leading '0x' and per-token ' 0x' prefixes)
//   - stripWhitespace: true (collapse all whitespace)
//
// Private — Phase 4 reads result.normalized from GradeResult instead of
// re-implementing this. Do NOT export.
function normalizeCodeAnswer(s: string): string {
  return s
    .toLowerCase()
    .replace(/^0x|\s0x/g, ' ')
    .replace(/\s+/g, '');
}

// =============================================================
// Singleton (the v1 instance Phase 4 imports)
// =============================================================

/**
 * Module-level singleton. Phase 4 islands import this and call grade() —
 * they never instantiate StaticGrader themselves. v2 swap point:
 *   export const grader: Grader = USE_REMOTE
 *     ? new RemoteGrader(url)
 *     : new StaticGrader();
 */
export const grader: Grader = new StaticGrader();
