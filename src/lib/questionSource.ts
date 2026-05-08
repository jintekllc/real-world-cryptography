// src/lib/questionSource.ts
//
// QuestionSource interface + v1 StaticQuestionSource implementation.
//
// CONTRACT (D-28, D-29, LIB-01): this is the ONLY module under src/lib/ that
// imports 'astro:content' for runtime data fetching. The grep gate G2
// enforces this:
//     grep -rn "from 'astro:content'" src/ \
//       | grep -v 'src/lib/questionSource.ts' \
//       | grep -v 'src/content.config.ts'
// must return zero matches. (src/content.config.ts is allowed because Astro
// requires defineCollection imports there; that's the schema authority, not
// a runtime data fetch.)
//
// All four methods return Promise<T> so the v2 AI milestone (AI-04) can
// drop in a remote adapter (RemoteQuestionSource) without touching any UI
// consumer.
//
// CONFLICT C-2 RESOLUTION:
// CONTEXT.md D-28 originally prescribed wrapping getCollection() in a
// resolved-promise call. Source-code inspection of
// node_modules/astro/dist/content/runtime.d.ts (RESEARCH.md §5 lines
// 458-461) confirms getCollection() and getEntry() already return
// Promise<...>. This v1 implementation `await`s them directly — the
// redundant resolved-promise wrap is omitted. D-28's async-first INTENT
// is preserved at the interface level (every method returns Promise<T>).
// The Phase 2 verification gate forbids the literal forbidden-token string
// from appearing anywhere in this file (see 02-VALIDATION.md and the
// plan's acceptance criteria).
//
// Pitfall 11.9 reminder: getCollection returns entries shaped
// { id, collection, data: { chapterId, questions } }[]
// NOT { chapterId, questions }[]. Always reach .data explicitly.

import { getCollection, getEntry } from 'astro:content';
import type { Question, Assessment } from '~/content.config';

// =============================================================
// Public interface (D-29 — exactly four methods, all async per D-28)
// =============================================================

export interface QuestionSource {
  /**
   * Find a single question by id across all banks. Returns null if no bank
   * contains a question with that id. v1 iterates banks; at v1's question
   * count (~1800 max for the final exam) this is sub-millisecond.
   */
  getById(id: string): Promise<Question | null>;

  /**
   * Resolve every question in an assessment, preserving the assessment's
   * questionIds array order. Returns [] if the assessment is missing.
   * Filters out null results from missing question ids — the failure mode
   * for a stale id is a shorter quiz, not a crash (Pitfall 11.7).
   */
  getByAssessment(assessmentId: string): Promise<Question[]>;

  /**
   * Look up an assessment record by id. Returns null if absent.
   */
  getAssessment(id: string): Promise<Assessment | null>;

  /**
   * Return every assessment record. Used by /assessments/index.astro to render
   * the listing page (D-96.2 — chapter quizzes are filtered out at the page
   * level). Order is whatever Astro emits; the page may filter or sort.
   */
  getAllAssessments(): Promise<Assessment[]>;

  /**
   * Return every question for a chapter, regardless of which bank file holds
   * it. v1 filters all banks where data.chapterId === chapterId and
   * concatenates their questions arrays — forward-compatible with Phase 6's
   * per-chapter-multiple-banks layout (e.g., ch01-required.json + ch01-challenge.json).
   */
  getByChapter(chapterId: string): Promise<Question[]>;
}

// =============================================================
// v1 implementation
// =============================================================

/**
 * StaticQuestionSource — reads from Astro 6's build-validated content store.
 * All data is already Zod-validated at build time (content.config.ts is the
 * schema authority); this class is the runtime read surface.
 */
export class StaticQuestionSource implements QuestionSource {
  async getById(id: string): Promise<Question | null> {
    // Iterate banks; find the question with matching id.
    // Pitfall 11.9: bank.data, NOT bank.
    const banks = await getCollection('questions');
    for (const bank of banks) {
      const found = bank.data.questions.find((q) => q.id === id);
      if (found !== undefined) return found;
    }
    return null;
  }

  async getByAssessment(assessmentId: string): Promise<Question[]> {
    const assessment = await this.getAssessment(assessmentId);
    if (assessment === null) return [];
    // Resolve each id in order; preserve assessment.questionIds ordering.
    const resolved = await Promise.all(
      assessment.questionIds.map((id) => this.getById(id)),
    );
    // Pitfall 11.7: stale ids resolve to null; filter them out (shorter
    // quiz instead of crash). Cross-collection lint is deferred to Phase 6.
    return resolved.filter((q): q is Question => q !== null);
  }

  async getAssessment(id: string): Promise<Assessment | null> {
    const entry = await getEntry('assessments', id);
    return entry?.data ?? null;
  }

  async getAllAssessments(): Promise<Assessment[]> {
    const entries = await getCollection('assessments');
    return entries.map((e) => e.data);
  }

  async getByChapter(chapterId: string): Promise<Question[]> {
    // Forward-compatible: ALL banks whose chapterId matches, concatenated.
    // Phase 6 may produce ch01-required.json + ch01-challenge.json — both
    // are returned. v1's single-bank-per-chapter is the degenerate case.
    const banks = await getCollection('questions', b => b.data.chapterId === chapterId);
    return banks.flatMap(b => b.data.questions);
  }
}

// =============================================================
// Singleton (the v1 instance Phase 3/4 imports)
// =============================================================

/**
 * Module-level singleton. Phase 3 chapter pages and Phase 4 QuizRunner
 * import this and call its methods directly — they never instantiate
 * StaticQuestionSource themselves. v2 swap point for AI-04:
 *   export const questionSource: QuestionSource =
 *     import.meta.env.PUBLIC_AI_PROXY_URL !== undefined
 *       ? new RemoteQuestionSource(import.meta.env.PUBLIC_AI_PROXY_URL)
 *       : new StaticQuestionSource();
 */
export const questionSource: QuestionSource = new StaticQuestionSource();
