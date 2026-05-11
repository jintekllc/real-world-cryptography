// src/lib/progress/schema.test.ts
//
// Phase 7 Plan 02 / Task 2 (TEST-02): Pin the three v1 Zod schemas
// (ProgressV1, MetaV1, ProjectsV1) and the VerdictSchema drift gate.
//
// VerdictSchema's enum MUST exactly match the five `Verdict` strings used by
// grader.ts; this test fires if either side drifts so the runtime contract
// (schema) and the compile-time contract (Verdict union in grader.ts)
// remain in lockstep.
//
// Default Vitest env is 'node' — these tests are pure Zod parse calls.

import { describe, it, expect } from 'vitest';
import {
  VerdictSchema,
  AttemptRecordSchema,
  ProgressV1Schema,
  MetaV1Schema,
  ProjectsV1Schema,
} from './schema';
import type { Verdict } from './schema';

// =============================================================
// VerdictSchema — drift gate against grader.ts's Verdict union
// =============================================================

describe('VerdictSchema (drift gate vs grader.ts Verdict type)', () => {
  it('enum options exactly equal the five known verdicts (set equality)', () => {
    // Order doesn't matter for the drift check; use Set equality. The five
    // strings must match grader.ts's `Verdict` union exactly.
    const expected: Set<Verdict> = new Set([
      'correct',
      'incorrect',
      'self-correct',
      'self-partial',
      'self-missed',
    ]);
    const actual = new Set(VerdictSchema.options);
    expect(actual).toEqual(expected);
  });
});

// =============================================================
// AttemptRecordSchema
// =============================================================

describe('AttemptRecordSchema', () => {
  const valid = {
    attemptId: '01HZX0AAAAAAAAAAAAAAAAAAAA',
    completedAt: '2026-05-11T00:00:00.000Z',
    score: 0.8,
    passed: true,
    perQuestion: { 'ch00-q01': 'correct' as const },
  };

  it('valid record parses (deep equal)', () => {
    expect(AttemptRecordSchema.parse(valid)).toEqual(valid);
  });

  it('score > 1 fails (max bound)', () => {
    expect(AttemptRecordSchema.safeParse({ ...valid, score: 1.5 }).success).toBe(false);
  });

  it('score < 0 fails (min bound)', () => {
    expect(AttemptRecordSchema.safeParse({ ...valid, score: -0.1 }).success).toBe(false);
  });

  it('non-chNN-qNN key in perQuestion fails (key regex)', () => {
    expect(
      AttemptRecordSchema.safeParse({
        ...valid,
        perQuestion: { 'BAD-KEY': 'correct' as const },
      }).success,
    ).toBe(false);
  });

  it('non-ISO completedAt fails (datetime format)', () => {
    expect(
      AttemptRecordSchema.safeParse({ ...valid, completedAt: 'yesterday' }).success,
    ).toBe(false);
  });
});

// =============================================================
// ProgressV1Schema
// =============================================================

describe('ProgressV1Schema', () => {
  const valid = {
    version: 1 as const,
    assessments: {},
  };

  it('valid empty progress parses (deep equal)', () => {
    expect(ProgressV1Schema.parse(valid)).toEqual(valid);
  });

  it('missing version fails (required literal)', () => {
    expect(ProgressV1Schema.safeParse({ assessments: {} }).success).toBe(false);
  });

  it('version: 2 fails (literal lock, future v2 rejection)', () => {
    expect(ProgressV1Schema.safeParse({ version: 2, assessments: {} }).success).toBe(false);
  });
});

// =============================================================
// MetaV1Schema
// =============================================================

describe('MetaV1Schema', () => {
  const valid = {
    version: 1 as const,
    studentName: 'alice',
    firstSeenAt: '2026-05-11T00:00:00.000Z',
    lastResetAt: null,
  };

  it('valid meta parses (deep equal)', () => {
    expect(MetaV1Schema.parse(valid)).toEqual(valid);
  });

  it('lastResetAt may be null (nullable)', () => {
    expect(MetaV1Schema.safeParse({ ...valid, lastResetAt: null }).success).toBe(true);
  });

  it('lastResetAt non-ISO fails (datetime format)', () => {
    expect(MetaV1Schema.safeParse({ ...valid, lastResetAt: 'not-iso' }).success).toBe(false);
  });

  it('version: 2 fails (literal lock)', () => {
    expect(MetaV1Schema.safeParse({ ...valid, version: 2 }).success).toBe(false);
  });
});

// =============================================================
// ProjectsV1Schema
// =============================================================

describe('ProjectsV1Schema', () => {
  const valid = {
    version: 1 as const,
    projects: {
      'aes-from-scratch': {
        started: true,
        completed: false,
        updatedAt: '2026-05-11T00:00:00.000Z',
      },
    },
  };

  it('kebab-case project id parses (deep equal)', () => {
    expect(ProjectsV1Schema.parse(valid)).toEqual(valid);
  });

  it('non-kebab key fails (kebab-case regex)', () => {
    expect(
      ProjectsV1Schema.safeParse({
        version: 1,
        projects: {
          NotKebab: {
            started: true,
            completed: false,
            updatedAt: '2026-05-11T00:00:00.000Z',
          },
        },
      }).success,
    ).toBe(false);
  });

  it('version: 2 fails (literal lock)', () => {
    expect(ProjectsV1Schema.safeParse({ ...valid, version: 2 }).success).toBe(false);
  });
});
