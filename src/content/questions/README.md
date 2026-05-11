# Question banks

This directory holds the JSON question banks consumed by `~/lib/questionSource`.
Each file is one entry in Astro's `questions` content collection (validated by
`questionBankSchema` in `src/content.config.ts`). After Phase 6 there are 17
banks on disk: `ch00-hello-crypto.json` (the Phase 2 model fixture) plus the
16 cohort-chapter banks `ch01-introduction.json` ... `ch16-when-and-where-cryptography-fails.json`.

## Question ID allocation contract (D-102)

Question ids follow the pattern `chNN-qMM` (e.g., `ch04-q01`). The MM range is
**permanently allocated** so any future regeneration cannot collide with the
historical Phase 5 stub-bank ID ranges.

| Range       | Owner         | Phase | Purpose                                                                |
|-------------|---------------|-------|------------------------------------------------------------------------|
| `q01..q79`  | Phase 6 gen   | 6     | Generated chapter quiz / part-test / final-exam questions (live).      |
| `q80..q89`  | Phase 5 stubs | 5     | Part-challenge stub questions — deleted in Phase 6 (06-06), reserved.  |
| `q90..q99`  | Phase 5 stubs | 5     | Part-required stub questions — deleted in Phase 6 (06-06), reserved.   |

**Binding rule:** any future regeneration pass MUST emit ids in the `q01..q79`
range. The `q80..q89` and `q90..q99` ranges are RESERVED (do not reuse) — they
were occupied by Phase 5 PLACEHOLDER stub banks that were deleted in Phase 6
plan 06-06 once the assessment fixtures were rewired to point at the generated
q01..q05 IDs. Reintroducing those ranges for a different purpose would break
the historical contract and confuse anyone reading earlier git history.

## Bank shape

Each `chXX-{slug}.json` file is one entry of shape `{ chapterId, questions[] }`
that validates against `questionBankSchema` (see `src/content.config.ts`).
Questions are a discriminated union over `kind`:

```jsonc
{
  "chapterId": "ch04",
  "questions": [
    {
      "id": "ch04-q01",
      "chapterId": "ch04",
      "kind": "mc",
      "prompt": "Which property does authenticated encryption add on top of confidentiality?",
      "choices": [
        "Forward secrecy",
        "Integrity and authenticity of the ciphertext",
        "Key derivation",
        "Post-compromise security"
      ],
      "answerIndex": 1,
      "explanation": "AE binds the ciphertext to a tag so tampering is detected at decryption.",
      "tags": ["aead", "confidentiality"],
      "difficulty": "easy"
    },
    {
      "id": "ch04-q02",
      "chapterId": "ch04",
      "kind": "tf",
      "prompt": "ECB mode is suitable for encrypting an image because identical blocks encrypt to identical ciphertexts.",
      "answer": false,
      "explanation": "Identical-block leakage in ECB defeats confidentiality; AES-GCM or similar is the right choice.",
      "difficulty": "easy"
    },
    {
      "id": "ch04-q03",
      "chapterId": "ch04",
      "kind": "short",
      "prompt": "What does the nonce in AES-GCM accomplish, and what happens on nonce reuse with the same key?",
      "modelAnswer": "The nonce makes each (key, nonce) pair unique, so the keystream changes for every message. Reusing a nonce with the same key reveals the XOR of the two plaintexts and enables forgery attacks on the authenticator.",
      "rubric": [
        "States that the nonce uniquifies the keystream per message",
        "States that reuse with the same key leaks plaintext XOR",
        "Mentions the authenticator / GHASH consequences"
      ],
      "difficulty": "easy"
    },
    {
      "id": "ch04-q05",
      "chapterId": "ch04",
      "kind": "code",
      "prompt": "What is the standard tag length in bytes for AES-128-GCM as defined by NIST SP 800-38D's recommended profile?",
      "referenceAnswer": "16",
      "autoGrade": true,
      "normalization": { "lowercase": true, "strip0x": true, "stripWhitespace": true },
      "difficulty": "hard"
    }
  ]
}
```

`code` questions use the fixed-bundle normalization `{ lowercase, strip0x, stripWhitespace }`
when `autoGrade` is set (D-27). `short` questions ship 2-4 rubric items so cohort
self-grading has enough granularity without becoming a verbatim-match exercise.

## Per-chapter sizing (D-103)

Every chapter bank contains exactly **5 questions** distributed as
**1 mc + 1 tf + 2 short + 1 code** (D-103.1), with a difficulty mix of
**3 easy + 1 normal + 1 hard** (D-105.1). Across `ch01..ch16` that yields 80
generated questions; combined with the 4 questions in `ch00-hello-crypto.json`
the total live question count is 84 (verified by G7 — see below).

The canonical slot-by-slot pattern (held across all 16 cohort chapters):

| Slot | Kind  | Difficulty | Typical content                                                  |
|------|-------|------------|------------------------------------------------------------------|
| q01  | mc    | easy       | Comprehension check ("which of these is X")                      |
| q02  | tf    | easy       | Common-misconception check (answer usually `false`)              |
| q03  | short | easy       | Definition / distinction with 3-4 rubric items                   |
| q04  | short | normal     | Applied recall ("how does X handle Y in case Z")                 |
| q05  | code  | hard       | Deterministic compute or recall of a fixed RFC / year / constant |

If a chapter genuinely lacks a clean compute question, D-103.5 permits swapping
the `code` slot for a second `short`. The swap MUST be documented in the
chapter's commit message. Through Phase 6 the fallback was never triggered —
every chapter supported some deterministic anchor (an RFC number, a historical
year, a fixed protocol constant).

## Assessment sizing (D-103.2, D-103.3)

Five assessment fixtures live in `src/content/assessments/`. Each references
`questionIds` from the chapter banks above:

| Fixture                  | Size | Selection rule                                                                  |
|--------------------------|------|----------------------------------------------------------------------------------|
| `part-1-required.json`   | 16   | 2 per chapter from ch01..ch08 — 1 easy mc (`q01`) + 1 normal short (`q04`)       |
| `part-1-challenge.json`  | 8    | 1 per chapter from ch01..ch08 — hard `q05` (hard-weighted)                       |
| `part-2-required.json`   | 16   | 2 per chapter from ch09..ch16 — 1 easy mc (`q01`) + 1 normal short (`q04`)       |
| `part-2-challenge.json`  | 8    | 1 per chapter from ch09..ch16 — hard `q05` (hard-weighted)                       |
| `final-exam.json`        | 20   | `q05` from every chapter ch01..ch16 (16) + 4 normal extras from harder chapters  |

The schema (`assessmentSchema` in `src/content.config.ts`) types `questionIds`
as `string[]` matching `/^ch\d{2}-q\d{2}$/`; cross-collection ID resolution is
NOT a schema check (Pitfall 11.7 acknowledged) — it is caught at Astro build
time when the runtime tries to resolve a `questionId` that no bank provides.
For that reason, before adding an ID to a fixture you MUST verify the ID exists
in a committed chapter bank.

## Regeneration (Phase 6 protocol)

If a chapter bank needs to be rewritten (e.g., post-cohort feedback flags a
weak question), follow the established Phase 6 protocol:

1. **Locate the book PDF.** Set `RWC_BOOK_PDF` to the absolute path of your
   local copy of *Real-World Cryptography* by David Wong, or place it at
   `./Real-World-Cryptography.pdf` (the default). The PDF is gitignored — never
   commit it, never copy its text to a committable file (D-104.1).

2. **Read the chapter on demand.** Use the Read tool with `pages:` ranges
   (≤20 PDF pages per call). The PDF chapter boundaries are reachable from the
   TOC at PDF pp.8-15. Build a mental coverage map (themes, MC facts, T/F
   misconceptions, short-answer concepts, code/numerical anchor) — do NOT
   persist extracted text to any file in the repo.

3. **Author the bank as JSON.** Replace the chapter's `src/content/questions/chXX-{slug}.json`.
   Preserve the 5-question shape (1 mc + 1 tf + 2 short + 1 code), the 3-easy /
   1-normal / 1-hard difficulty mix, and the `q01..q05` ID slots (do NOT mint
   new IDs in the reserved `q80..q99` ranges). Paraphrase aggressively in the
   long free-form fields (`modelAnswer`, `rubric`, `explanation`, long MC
   choices) — these are where G7 typically catches verbatim leaks.

4. **Verify locally.** Run `pnpm check && pnpm gates`. Both must exit 0.
   If G7 reports a verbatim 8-gram match, paraphrase the offending field
   (preserve question intent and rubric depth — see "n-gram check protocol"
   below for guidance) and re-run.

5. **Commit atomically.** One chapter per commit, message format:
   `feat(06-XX): regenerate chXX quiz bank (1 mc / 1 tf / 2 short / 1 code, 5 questions)`.
   If D-103.5 fallback (code→short) was used, document it in the commit
   message. No `Co-Authored-By` trailer (CLAUDE.md global rule).

For a fresh chapter (one that does not yet exist), the same protocol applies —
substitute "author" for "regenerate" in step 5.

## n-gram check protocol (G7, GEN-02)

**Source:** `scripts/n-gram-guard.mjs` (invoked from `scripts/gates.sh` as gate G7).

**Trigger:** every `pnpm gates` run (and therefore every `pnpm gates:dist` post-build run).

**What it does:** 8-gram (8-word) sliding-window comparison of every committed
question's text fields against the full book PDF text. Both sides are normalized
identically — lowercased, every run of non-alphanumeric chars collapsed to a
single space, trimmed. The book is extracted on the fly via `pdftotext -layout`
(no temp file; D-104.1) and indexed into a `Set<string>` of 8-grams keyed by
first-occurrence page number for actionable failure reports.

**Fields scanned:**

- `prompt` (every kind)
- `choices[]` (mc only)
- `modelAnswer` (short only)
- `rubric[]` (short only)
- `explanation` (when present; any kind)

**Fields NOT scanned:**

- `answer` (tf — boolean)
- `referenceAnswer` (code — deterministic hex / numeric value)
- `id`, `chapterId`, `kind`, `answerIndex`, `autoGrade`, `normalization`,
  `tags`, `difficulty` (metadata, not surface-visible verbatim text)

**Failure mode:** `[G7] FAIL: <file> question=<id> page=<N> ngram="<8 words>"`
followed by `[G7] paraphrase guard: <N> violation(s) — regenerate the offending
question(s) with paraphrased wording.` Exit code 1.

**Skip behavior:** `scripts/gates.sh` SKIPs G7 when the book PDF is absent at
`$RWC_BOOK_PDF` (default `./Real-World-Cryptography.pdf`). This keeps `pnpm gates`
green for cohort developers who clone the repo without the gitignored PDF.

**Hard-fail in CI / generation environments:** set `RWC_GATES_REQUIRE_PDF=1`
to convert the SKIP into a hard failure. Generation passes and release CI MUST
run with this flag.

**Re-running after a paraphrase fix:** edit the offending question's wording
in the bank file (preserve question intent and rubric depth — paraphrase, don't
regenerate), re-run `pnpm gates` to confirm green, then re-commit (or amend if
the prior commit has not been pushed). The Phase 6 batches caught and fixed
G7 misses in the `modelAnswer` / `rubric` / `explanation` long-field surface
about 5% of the time (4 of 80 generated questions — see plan SUMMARYs); the
prompts themselves almost never tripped the guard.

**Seed test (cohort-review-reproducible):** to verify the guard catches a
planted verbatim 8-gram, drop a temporary bank into `src/content/questions/`
whose `modelAnswer` (or any other scanned field) contains 8+ consecutive words
copied verbatim from a known book page, then run `pnpm gates` — expect exit 1
with a `[G7] FAIL` line citing the seed file + page number. Delete the seed
file and re-run — expect exit 0 again. This procedure was executed once during
plan 06-01 Task 2; the seed file is NOT committed.

## Spot-check workflow (D-105.4)

Phase 6's generation run surfaced three cohort-review checkpoints:

- **Start** — `ch01` (plan 06-02)
- **Middle** — `ch08` (plan 06-04)
- **End** — `ch16` (plan 06-06)

At each checkpoint the human reviewer applies a per-kind check:

- **mc:** distractors plausible (not obviously absurd); correct answer not
  always at position D; prompt grounded in real chapter content.
- **tf:** answer unambiguous (no "well, it depends" gray area); targets a
  common misconception the chapter explicitly debunks.
- **short:** `modelAnswer` paraphrased (not a chapter quote); rubric items
  concept-checkable for self-grading; difficulty rating matches actual
  cognitive load.
- **code:** `referenceAnswer` is recomputable from the chapter alone (do the
  calculation; don't trust the value); normalization bundle matches schema
  convention `{ lowercase, strip0x, stripWhitespace }`.

If a regenerated chapter needs a fresh spot-check, follow the same template
and record approval in the relevant plan `SUMMARY.md` (e.g.,
`.planning/phases/06-content-generation-pipeline/06-XX-SUMMARY.md`).

The autonomous batch chapters (`ch02..ch07` from plan 06-03 and `ch09..ch15`
from plan 06-05) did not surface per-chapter checkpoints — they inherit the
ch01 voice / difficulty mix / rubric depth / tag taxonomy and rely on G7 +
schema validation as the unattended quality gate. The cohort reviewer
spot-checks them as a batch at the next checkpoint.

## Schema reference

See `src/content.config.ts` for the binding `questionSchema` (Zod 4
discriminated union over `kind: 'mc' | 'tf' | 'short' | 'code'`) and
`questionBankSchema` (`{ chapterId, questions: Question[] }`). The schemas
fail the build on any drift — that is the strong correctness guarantee.
