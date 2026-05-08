// src/lib/codingProjectSource.ts
//
// Chokepoint for the codingProjects content collection (D-98.4 + D-99.1).
// G2 gate already permits astro:content imports under src/lib/; G2b will be
// extended in Plan 05-05 to also forbid pages from calling
// getCollection('codingProjects') directly — they must call this helper.
//
// SIBLING (not subclass): kept separate from ~/lib/questionSource so the
// QuestionSource interface stays narrow. Responsibilities: question + assessment
// reads = QuestionSource; coding-project reads = this module. RESEARCH Pattern 6.
//
// Phase 7 will Vitest this directly via getCollection mocking — keep it thin.

import { getCollection } from 'astro:content';
import type { CodingProject } from '~/lib/types';

/**
 * Return every coding-project entry. Pages render the array as a single column
 * of <CodingProjectCard> instances. Order is whatever Astro emits (file-system
 * order under src/content/coding-projects/); the page shell may sort if needed.
 *
 * @returns Promise<CodingProject[]> — empty array if the collection is empty
 */
export async function getAllCodingProjects(): Promise<CodingProject[]> {
  const entries = await getCollection('codingProjects');
  return entries.map((e) => e.data);
}
