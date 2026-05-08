// src/lib/types.ts
//
// Single import surface for every consumer of Phase 2 contracts.
// Consumers never reach into 'astro:content' or 'astro/zod' directly.
// This module is the seam D-41 codifies (no Astro.glob, no astro:content
// imports outside src/lib/questionSource.ts and src/content.config.ts).
//
// Use this module in every consumer:
//   import type { Question, Assessment } from '~/lib/types';
//   import type { Answer, GradeResult } from '~/lib/types';
//   import type { ProgressV1, AttemptRecord } from '~/lib/types';
//
// `verbatimModuleSyntax: true` in tsconfig.json requires `export type`
// for type-only re-exports. Do NOT add `export { ... }` (without `type`)
// — it would generate runtime imports for things that don't exist at
// runtime.

export type { Chapter, QuestionBank, Question, Assessment } from '~/content.config';
export type { CodingProject } from '~/content.config';
export type { Answer, GradeResult, Verdict } from '~/lib/grader';
export type { ProgressV1, MetaV1, ProjectsV1, ProjectRecord, AssessmentProgress, AttemptRecord } from '~/lib/progress/schema';
