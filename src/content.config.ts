// src/content.config.ts
//
// Source-of-truth schemas for all three content collections (chapters,
// questions, assessments). Astro reads this during astro sync / astro build
// to validate every entry. Build fails on any drift — that's the point.
//
// CONTRACT (D-39, D-40, D-41 — see 02-VALIDATION.md for the gate commands):
//   - D-39: z is imported from astro/zod — never from astro:content
//     (Pitfall 11.1). Grep gate G4 enforces this; the only acceptable
//     astro:content import is { defineCollection }.
//   - D-40: Loaders use glob({ pattern, base }) from astro/loaders — never
//     the legacy collections API (Pitfall 11.2).
//   - D-41: The dot-glob helper on the Astro global object is forbidden
//     anywhere in the project. Grep gate G3 enforces this; this file must
//     not contain that helper name as a literal substring.
//
// The Question schema is a Zod 4 discriminated union over `kind`. The
// discriminator field name is `kind` (NOT `type`) per CLAUDE.md.

import { defineCollection } from 'astro:content';   // defineCollection ONLY
import { z } from 'astro/zod';                       // D-39: NOT astro:content
import { glob } from 'astro/loaders';                // D-40: glob loader

// =============================================================
// Discriminated Question schema (the load-bearing contract)
// =============================================================

// Base fields every kind shares. NOT exported — kinds extend, not consumers.
const questionBase = z.object({
  id: z.string()
    .regex(/^ch\d{2}-q\d{2}$/, 'Question id must match ch\\d\\d-q\\d\\d (D-24)'),
  chapterId: z.string()
    .regex(/^ch\d{2}$/, 'Chapter id must match ch\\d\\d (D-24)'),
  prompt: z.string().min(1),                          // D-25: plain string
  // D-26: optional v1 base fields
  explanation: z.string().optional(),
  tags: z.array(z.string()).optional(),
  difficulty: z.enum(['easy', 'normal', 'hard']).optional(),
  // D-25: optional code block for code/calc question prompts (Phase 4 renders)
  codeBlock: z.object({
    lang: z.string(),
    source: z.string(),
  }).optional(),
});

// --- Multiple choice
const mcSchema = questionBase.extend({
  kind: z.literal('mc'),
  choices: z.array(z.string()).min(2),
  answerIndex: z.number().int().nonnegative(),
});

// --- True/false
const tfSchema = questionBase.extend({
  kind: z.literal('tf'),
  answer: z.boolean(),
});

// --- Short answer (D-27: modelAnswer + rubric 2..4 items)
const shortSchema = questionBase.extend({
  kind: z.literal('short'),
  modelAnswer: z.string().min(1),
  rubric: z.array(z.string()).min(2).max(4),         // SCHM-04
});

// --- Code / calculation (D-27: fixed-bundle normalization when autoGrade)
// Note: autoGrade and normalization are independently optional at the schema
// level. Convention (D-27): when autoGrade is true, normalization is supplied;
// when autoGrade is absent, normalization is ignored. The Hello Crypto fixture
// in Plan 02 respects this convention so astro check exercises both fields
// together. A Zod .refine() to enforce the pairing was considered (Q12.4) but
// rejected — research §12 flags that .refine() can break discriminator
// narrowing in Zod 4 in some cases. Convention is enforced by Phase 6's
// generator and human review of fixtures.
const codeSchema = questionBase.extend({
  kind: z.literal('code'),
  referenceAnswer: z.string().min(1),
  autoGrade: z.literal(true).optional(),              // SCHM-05
  normalization: z.object({                            // fixed bundle — all 3 keys required true
    lowercase: z.literal(true),
    strip0x: z.literal(true),
    stripWhitespace: z.literal(true),
  }).optional(),
});

const questionSchema = z.discriminatedUnion('kind', [
  mcSchema, tfSchema, shortSchema, codeSchema,
]);

// =============================================================
// Collections
// =============================================================

// Local schema objects — Zod 4 typed at point of definition so
// `z.infer<typeof X>` resolves cleanly. defineCollection() declares
// `schema?: S | ((ctx) => S)` (optional + may be a thunk), so inferring
// from `chapters.schema` directly resolves to `{}`. Hoisting the schema
// objects out of the defineCollection() call sites preserves the schemas
// as the single source of truth while letting consumers re-derive types.

const chapterSchema = z.object({
  chapter: z.string().regex(/^ch\d{2}$/),           // 'ch00' .. 'ch12'
  part: z.union([z.literal(1), z.literal(2)]),       // numeric literals (Zod 4)
  title: z.string().min(1),
  order: z.number().int().nonnegative(),
});

const questionBankSchema = z.object({
  chapterId: z.string().regex(/^ch\d{2}$/),
  questions: z.array(questionSchema).min(1),
});

// assessmentId is free-form kebab-case (Q12.5) so Phase 6 can mint per-chapter
// quiz ids without a schema bump. D-24 names six known IDs; the regex permits
// those AND future ones like 'ch01-quiz', 'ch01-challenge'.
const assessmentSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),  // kebab-case (Q12.5)
  title: z.string().min(1),
  kind: z.enum([
    'quiz', 'challenge', 'part-test', 'part-challenge', 'final-exam',
  ]),
  passThreshold: z.number().min(0).max(1),           // 0.7, 0.75, 0.8
  questionIds: z.array(z.string().regex(/^ch\d{2}-q\d{2}$/)).min(1),
  // D-95: opt-in field; Phase 5 sets 'end-only' on final-exam without
  // re-touching QuizRunner. Optional (not .default()) so existing fixtures
  // validate unchanged and Phase 4 callers default at the call site.
  feedbackMode: z.enum(['per-question', 'end-only']).optional(),
});

// =============================================================
// CodingProject (D-98.1, D-98.4, D-99.5) — Phase 5 fourth collection
// =============================================================
// Each entry is one self-contained JSON file under src/content/coding-projects/.
// Schema fields locked in 05-CONTEXT.md D-98.1 + UI-SPEC.md §Coding-project page:
//   - id: kebab-case (matches ProjectsV1Schema's record key regex in src/lib/progress/schema.ts)
//   - title, summary, recommendedChapters[], deliverables[], difficulty
const codingProjectSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  title: z.string().min(1),
  summary: z.string().min(1),
  recommendedChapters: z.array(z.string().regex(/^ch\d{2}$/)).min(1),
  deliverables: z.array(z.string().min(1)).min(1),
  difficulty: z.enum(['easy', 'normal', 'hard', 'stretch']),
});

// `chapters` — one Markdown file per chapter (D-37 fixture is ch00-hello-crypto)
const chapters = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/chapters' }),
  schema: chapterSchema,
});

// `questions` — one JSON BANK FILE per chapter; each file = one entry.
// Entry shape: { chapterId, questions: Question[] }. Discriminated union runs
// per-question inside each bank.
const questions = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/questions' }),
  schema: questionBankSchema,
});

// `assessments` — one JSON file per assessment; each file = one entry.
// `questionIds` is a string[] referencing question.id values inside any bank.
// We do NOT use Astro's `reference()` because questions are nested inside
// banks, not top-level collection entries (Pitfall 11.7 acknowledged —
// cross-collection lint is deferred to Phase 6).
const assessments = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/assessments' }),
  schema: assessmentSchema,
});

// `codingProjects` — one JSON file per project. Hydrated by CodingProjectToggles.svelte
// island via the [data-rwc-project-toggle] slot pattern (D-99.5). Reads happen ONLY
// through ~/lib/codingProjectSource.ts (Plan 02 — G2b regex extension forbids
// getCollection('codingProjects') in src/pages/).
const codingProjects = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/coding-projects' }),
  schema: codingProjectSchema,
});

export const collections = { chapters, questions, assessments, codingProjects };

// Note (Conflict C-2 resolution): Astro 6's getCollection() and getEntry()
// already return Promise<...>. The QuestionSource v1 implementation
// (src/lib/questionSource.ts, Plan 03) awaits them directly — the
// redundant resolved-promise wrap is omitted. The async-first contract
// from D-28 is honored at the interface level.

// Inferred types — re-exported by src/lib/types.ts (Plan 03) so consumers
// never reach into astro:content or astro/zod directly. We infer from the
// local schema constants (not chapters.schema etc.) because
// defineCollection's return type marks `schema` as optional, which would
// resolve `z.infer<typeof chapters.schema>` to `{}`.
export type Chapter = z.infer<typeof chapterSchema>;
export type QuestionBank = z.infer<typeof questionBankSchema>;
export type Question = z.infer<typeof questionSchema>;
export type Assessment = z.infer<typeof assessmentSchema>;
export type CodingProject = z.infer<typeof codingProjectSchema>;
