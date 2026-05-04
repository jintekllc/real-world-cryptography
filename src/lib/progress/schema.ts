// src/lib/progress/schema.ts
//
// Zod schemas + inferred types for ProgressV1 and MetaV1 storage shapes.
// Imported by src/lib/progress/index.ts (the chokepoint) and re-exported
// from src/lib/types.ts so Phase 4 consumers import from a single path.
//
// CONTRACT (D-39): z is imported from 'astro/zod' — NOT 'astro:content'.
// CONTRACT (D-34): version is a literal 1 (numeric). v2 will use z.literal(2)
// and dispatch in migrate.ts. The literal is the type-level v1->v1 lock.
//
// Verdict drift gate: VerdictSchema's five strings MUST exactly match the
// `Verdict` type in src/lib/grader.ts. This file deliberately re-declares
// the values rather than importing them so the schema stays self-contained
// for v2-migration purposes; the project's CI gate diffs the two files'
// extracted literals to enforce equality.

import { z } from 'astro/zod';

// =============================================================
// Verdict (D-31; mirrors grader.ts's Verdict type — kept in sync by gate)
// =============================================================

export const VerdictSchema = z.enum([
  'correct', 'incorrect', 'self-correct', 'self-partial', 'self-missed',
]);

// =============================================================
// AttemptRecord (D-34) — one quiz/test/exam attempt
// =============================================================

export const AttemptRecordSchema = z.object({
  attemptId: z.string().min(1),                       // ULID; min(1) is a defensive lower bound
  completedAt: z.string().datetime(),                  // ISO 8601
  score: z.number().min(0).max(1),                     // fraction
  passed: z.boolean(),
  perQuestion: z.record(
    z.string().regex(/^ch\d{2}-q\d{2}$/),              // Pitfall 11.12: two-arg z.record
    VerdictSchema,
  ),
});

// =============================================================
// AssessmentProgress (D-34) — best-preserved + bounded recent history
// =============================================================

export const AssessmentProgressSchema = z.object({
  best: AttemptRecordSchema,                            // always preserved (D-34)
  recent: z.array(AttemptRecordSchema).max(5),          // bounded length 5
});

// =============================================================
// ProgressV1 (D-34) — per-assessment progress map keyed by assessment id
// =============================================================

export const ProgressV1Schema = z.object({
  version: z.literal(1),                                // EXACT v1 lock (Zod 4 numeric literal)
  assessments: z.record(z.string(), AssessmentProgressSchema),
});

// =============================================================
// MetaV1 (D-34) — student name + first-seen timestamp; persists across reset
// =============================================================

export const MetaV1Schema = z.object({
  version: z.literal(1),
  studentName: z.string(),
  firstSeenAt: z.string().datetime(),
  lastResetAt: z.string().datetime().nullable(),
});

// =============================================================
// Inferred types (re-exported by src/lib/types.ts)
// =============================================================

// Types inferred for consumers. Re-exported by src/lib/types.ts so Phase 4
// imports from one stable path: import type { ProgressV1 } from '~/lib/types'.
export type Verdict = z.infer<typeof VerdictSchema>;
export type AttemptRecord = z.infer<typeof AttemptRecordSchema>;
export type AssessmentProgress = z.infer<typeof AssessmentProgressSchema>;
export type ProgressV1 = z.infer<typeof ProgressV1Schema>;
export type MetaV1 = z.infer<typeof MetaV1Schema>;
