#!/usr/bin/env node
// scripts/n-gram-guard.mjs
//
// Phase 6 — GEN-02 paraphrase guard. Compares every committed question's text
// against the full Real-World Cryptography PDF using an 8-gram (8-word)
// sliding-window comparison after a uniform normalization step. Exits non-zero
// on the first verbatim 8-gram match, with chapter + question id + the
// matching n-gram + the PDF page number where it appears in the book.
//
// CONTRACT (binding via .planning/phases/06-content-generation-pipeline/06-CONTEXT.md):
//   - D-104.1: PDF read on demand; in-memory only; no fs.writeFile of book text;
//              no temp file (pdftotext is invoked with `-` to stream stdout).
//   - D-104.2: scan against the FULL book text, not just one chapter (catches
//              accidental cross-chapter matches).
//   - D-104.3: normalization = lowercase + strip punctuation (collapse every
//              run of non-alphanumeric chars to a single space) + trim.
//   - D-104.4: N = 8 (eight consecutive normalized words).
//   - D-104.5: this script is invoked as gate G7 from scripts/gates.sh.
//   - D-104.6: extraction uses the `pdftotext` system binary (poppler-utils),
//              spawned via node:child_process. NO npm dep. PDF path read from
//              RWC_BOOK_PDF env var (default ./Real-World-Cryptography.pdf,
//              gitignored).
//
// FIELDS SCANNED per question (paraphrase scope):
//   - prompt                (always)
//   - choices[]             (mc only)
//   - modelAnswer           (short only)
//   - rubric[]              (short only)
//   - explanation           (when present; any kind)
// FIELDS NOT SCANNED:
//   - referenceAnswer (code — deterministic hex/numeric value)
//   - answer (tf — boolean)
//   - id, chapterId, kind, choices' answerIndex, autoGrade, normalization,
//     tags, difficulty (metadata, not visible verbatim text against the book)
//
// EXIT CODES:
//   0 — no violation; baseline OK summary printed
//   1 — at least one violation; per-violation lines + summary printed
//   2 — environment error (missing PDF, missing pdftotext, malformed JSON)

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import process from 'node:process';

// ----- Constants -------------------------------------------------------------

// D-104.4: 8-word window. "Common technical phrases like 'AES-256 in CBC mode'
// (5 words) pass; longer verbatim chunks fail."
const N = 8;

const QUESTIONS_DIR = path.resolve(process.cwd(), 'src/content/questions');
const PDF_DEFAULT = path.resolve(process.cwd(), 'Real-World-Cryptography.pdf');
const PDF_PATH = process.env.RWC_BOOK_PDF
  ? path.resolve(process.env.RWC_BOOK_PDF)
  : PDF_DEFAULT;

// ----- Normalization (D-104.3) -----------------------------------------------

// normalize(s): lowercase the string, replace every run of non-alphanumeric
// characters with a single space, then trim. Applied identically to BOTH the
// book text and the question text — so the 8-gram comparison is genuinely
// comparing the same surface form on both sides.
function normalize(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// tokenize(normalizedString): returns the word array. Empty strings filtered
// (defends against leading/trailing whitespace edge cases the trim missed).
function tokenize(normalized) {
  if (!normalized) return [];
  return normalized.split(' ').filter(Boolean);
}

// slideNgrams(tokens, n): generator-style — returns the array of n-gram
// strings (each a space-joined window). Returns empty array if tokens.length < n.
function slideNgrams(tokens, n) {
  const out = [];
  if (tokens.length < n) return out;
  for (let i = 0; i + n <= tokens.length; i++) {
    out.push(tokens.slice(i, i + n).join(' '));
  }
  return out;
}

// ----- Environment guards ----------------------------------------------------

function ensurePdfPresent() {
  if (!existsSync(PDF_PATH)) {
    console.error(
      `error: book PDF not found at ${PDF_PATH}; ` +
        `set RWC_BOOK_PDF or place the PDF at the default location ` +
        `(it is gitignored).`,
    );
    process.exit(2);
  }
}

function ensurePdftotextPresent() {
  // pdftotext -v writes the version banner to STDERR. Modern poppler exits 0;
  // older poppler releases (≤0.41) and some downstream forks exit 99 even when
  // functional (WR-02). Treat the binary as available as long as spawnSync
  // didn't error out (ENOENT) and the banner regex matches — the banner is the
  // load-bearing signal, the exit code is incidental.
  const probe = spawnSync('pdftotext', ['-v'], { encoding: 'utf8' });
  const banner = (probe.stderr || '') + (probe.stdout || '');
  const ok = !probe.error && /pdftotext|poppler/i.test(banner);
  if (!ok) {
    console.error(
      'error: pdftotext not found on PATH; install with: ' +
        'sudo apt install poppler-utils (Debian/Ubuntu) or ' +
        'brew install poppler (macOS).',
    );
    process.exit(2);
  }
}

// ----- Book extraction (D-104.6) --------------------------------------------

// Spawn `pdftotext -layout -enc UTF-8 <pdf> -`. The trailing `-` streams the
// extracted text to stdout (no temp file on disk — D-104.1). pdftotext emits
// a form-feed (\f) between pages, which we use to build a 1-based page index
// for failure-reporting (page = pageIndex + 1).
function extractBook() {
  const res = spawnSync(
    'pdftotext',
    ['-layout', '-enc', 'UTF-8', PDF_PATH, '-'],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  if (res.status !== 0) {
    const errMsg = (res.stderr || '').trim() || `exit ${res.status}`;
    console.error(`error: pdftotext failed on ${PDF_PATH}: ${errMsg}`);
    process.exit(2);
  }
  const raw = res.stdout || '';
  const pages = raw.split('\f'); // pages[0] = page 1
  return { raw, pages };
}

// Build the book n-gram set + first-page index map.
//   - bookNgrams: Set<string> of every 8-gram in normalized book text
//   - pageOf:    Map<string, number> mapping each n-gram to the FIRST 1-based
//                page on which it occurs (for actionable failure reports). When
//                an n-gram's tokens span a page break, the reported page is the
//                page of the FIRST token in the matching window — caller can
//                infer "pages N..N+1" by walking adjacent tokenPage entries if
//                richer attribution is needed.
//
// Per WR-01 (06-REVIEW): slide the 8-gram window over the FULL book token
// stream (concatenated across pages) so verbatim 8-grams that straddle a page
// boundary are not silently missed. Earlier per-page tokenization left every
// page boundary as a blind spot — every 8-token sequence whose first token
// landed on page N and whose last token landed on page N+1 was uninserted.
function buildBookIndex(pages) {
  const bookNgrams = new Set();
  const pageOf = new Map();
  // Flatten while remembering which page each token came from.
  const allTokens = [];
  const tokenPage = [];
  for (let i = 0; i < pages.length; i++) {
    const toks = tokenize(normalize(pages[i]));
    for (const t of toks) {
      allTokens.push(t);
      tokenPage.push(i + 1);
    }
  }
  if (allTokens.length < N) return { bookNgrams, pageOf };
  for (let j = 0; j + N <= allTokens.length; j++) {
    const gram = allTokens.slice(j, j + N).join(' ');
    bookNgrams.add(gram);
    if (!pageOf.has(gram)) pageOf.set(gram, tokenPage[j]);
  }
  return { bookNgrams, pageOf };
}

// ----- Question text extraction ---------------------------------------------

// Per the plan's Task 1 step 6 + the schema in src/content.config.ts:
//   - prompt                (every kind)
//   - choices[]             (mc)
//   - modelAnswer + rubric  (short)
//   - explanation           (optional; any kind)
// Returns string[] — caller normalizes/tokenizes/slides per field.
function questionTextFields(q) {
  const fields = [];
  if (typeof q.prompt === 'string') fields.push(q.prompt);
  if (q.kind === 'mc' && Array.isArray(q.choices)) {
    for (const c of q.choices) {
      if (typeof c === 'string') fields.push(c);
    }
  }
  if (q.kind === 'short') {
    if (typeof q.modelAnswer === 'string') fields.push(q.modelAnswer);
    if (Array.isArray(q.rubric)) {
      for (const r of q.rubric) {
        if (typeof r === 'string') fields.push(r);
      }
    }
  }
  if (typeof q.explanation === 'string') fields.push(q.explanation);
  return fields;
}

// ----- Main ------------------------------------------------------------------

function main() {
  ensurePdfPresent();
  ensurePdftotextPresent();

  // Read every *.json file under src/content/questions/ (the README.md and
  // any non-.json sibling are ignored — Astro's content loader uses the same
  // glob filter, so anything here that isn't *.json is documentation).
  if (!existsSync(QUESTIONS_DIR)) {
    console.error(`error: questions directory not found: ${QUESTIONS_DIR}`);
    process.exit(2);
  }
  const bankFiles = readdirSync(QUESTIONS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  if (bankFiles.length === 0) {
    console.log(
      `[G7] paraphrase guard: OK (0 questions across 0 banks scanned ` +
        `against book — no JSON banks present)`,
    );
    process.exit(0);
  }

  // Extract the book ONCE per script invocation, then reuse the n-gram set
  // for every question — keeps the cost ~O(book_tokens) + O(question_tokens)
  // rather than O(banks * book_tokens).
  const { pages } = extractBook();
  const { bookNgrams, pageOf } = buildBookIndex(pages);

  // Scan banks. One violation per question is recorded (don't flood the
  // output) but the loop continues across questions/banks so multiple
  // failures surface in one run.
  const violations = [];
  let questionCount = 0;
  for (const file of bankFiles) {
    const full = path.join(QUESTIONS_DIR, file);
    const raw = readFileSync(full, 'utf8');
    let bank;
    try {
      bank = JSON.parse(raw);
    } catch (err) {
      console.error(`error: malformed JSON: ${file}: ${err.message}`);
      process.exit(2);
    }
    const questions = Array.isArray(bank.questions) ? bank.questions : [];
    for (const q of questions) {
      questionCount++;
      const fields = questionTextFields(q);
      let hit = null;
      for (const field of fields) {
        const tokens = tokenize(normalize(field));
        const grams = slideNgrams(tokens, N);
        for (const g of grams) {
          if (bookNgrams.has(g)) {
            hit = { ngram: g, page: pageOf.get(g) };
            break;
          }
        }
        if (hit) break;
      }
      if (hit) {
        violations.push({
          file,
          questionId: q.id || '(unknown id)',
          ngram: hit.ngram,
          page: hit.page,
        });
      }
    }
  }

  if (violations.length === 0) {
    console.log(
      `[G7] paraphrase guard: OK (${questionCount} questions across ` +
        `${bankFiles.length} banks scanned against ${pages.length} book pages)`,
    );
    process.exit(0);
  }

  for (const v of violations) {
    console.error(
      `[G7] FAIL: ${v.file} question=${v.questionId} ` +
        `page=${v.page} ngram="${v.ngram}"`,
    );
  }
  console.error(
    `[G7] paraphrase guard: ${violations.length} violation(s) — ` +
      `regenerate the offending question(s) with paraphrased wording.`,
  );
  process.exit(1);
}

main();
