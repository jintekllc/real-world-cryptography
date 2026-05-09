# Question banks

This directory holds the JSON question banks consumed by `~/lib/questionSource`.
Each file is one entry in Astro's `questions` content collection (validated by
`questionBankSchema` in `src/content.config.ts`).

## Question ID allocation contract (D-102)

Question ids follow the pattern `chNN-qMM` (e.g., `ch04-q90`). The MM range is
**permanently allocated** to prevent Phase 6's generation pipeline from
colliding with Phase 5's hand-curated stubs.

| Range       | Owner       | Phase | Purpose                                                         |
|-------------|-------------|-------|-----------------------------------------------------------------|
| `q01..q79`  | Phase 6 gen | 6     | Auto-generated chapter quiz + part-test + final-exam questions  |
| `q80..q89`  | Phase 5     | 5     | Part-challenge stub questions (10 slots per chapter)            |
| `q90..q99`  | Phase 5     | 5     | Part-required stub questions (10 slots per chapter)             |

**Binding rule:** Phase 6's generation script MUST emit ids in the `q01..q79`
range only. Phase 5 stubs in the combined `q80..q89` (challenge) and
`q90..q99` (required) ranges are explicitly marked `PLACEHOLDER` in their
`prompt`/`explanation` fields so a Phase 6 author can recognize them at a
glance, but the contract is the id range — Phase 6 must not touch any id in
`q80..q89` or `q90..q99`.

## Phase 5 stub bank inventory

Per-chapter part-required stubs (one question each at `chNN-q90`):
- `ch01-part-required-stub.json` through `ch16-part-required-stub.json` (16 files)

Per-chapter part-challenge stubs (one question each at `chNN-q80`; 6 chapters
selected as challenge anchors per the four part-challenge fixtures):
- `ch01-part-challenge-stub.json` (Part 1 anchor)
- `ch04-part-challenge-stub.json` (Part 1 anchor)
- `ch08-part-challenge-stub.json` (Part 1 anchor)
- `ch09-part-challenge-stub.json` (Part 2 anchor)
- `ch12-part-challenge-stub.json` (Part 2 anchor)
- `ch16-part-challenge-stub.json` (Part 2 anchor)

The final-exam fixture (`src/content/assessments/final-exam.json`) does NOT
have its own stub bank — it cross-references the per-chapter `chNN-q90` ids
that the part-required stubs already provide.

## Phase 6 — regeneration protocol (placeholder)

Phase 6 will populate this section with the regenerate command, the n-gram
similarity-check protocol, and the spot-check workflow. Until then, every
file in this directory is reviewable as plain JSON in the repo (per CLAUDE.md
"Generated questions must be reviewable as plain JSON").

## Schema reference

See `src/content.config.ts` for the binding `questionSchema` (discriminated
union over `kind: 'mc' | 'tf' | 'short' | 'code'`) and `questionBankSchema`
(`{ chapterId, questions: Question[] }`).
