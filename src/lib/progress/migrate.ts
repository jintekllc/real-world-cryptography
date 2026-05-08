// src/lib/progress/migrate.ts
//
// v1 -> v1 no-op migration. Returns the value unchanged after Zod validation.
// v2 will dispatch on raw.version and migrate forward; the seam exists here
// for that future change. Today, both functions are thin safeParse wrappers.
//
// CONTRACT (D-36): fail-soft. Returns T | null on success / failure.
// Throwing variants are explicitly rejected (D-36) — the chokepoint module
// (index.ts) owns the try/catch around storage I/O; this module owns the
// schema check.

import { ProgressV1Schema, MetaV1Schema, ProjectsV1Schema } from './schema';
import type { ProgressV1, MetaV1, ProjectsV1 } from './schema';

/**
 * Migrate a raw ProgressV1 candidate (already JSON.parsed) through any
 * version transitions to the current ProgressV1 shape. v1 -> v1 is a no-op:
 * the value is validated against ProgressV1Schema and returned, or null
 * is returned on schema mismatch.
 *
 * @param raw - Unknown JSON-parsed value (caller's responsibility to JSON.parse)
 * @returns ProgressV1 on success, null on schema mismatch
 */
export function migrateProgress(raw: unknown): ProgressV1 | null {
  const parsed = ProgressV1Schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Migrate a raw MetaV1 candidate. v1 -> v1 is a no-op (same as migrateProgress).
 *
 * @param raw - Unknown JSON-parsed value (caller's responsibility to JSON.parse)
 * @returns MetaV1 on success, null on schema mismatch
 */
export function migrateMeta(raw: unknown): MetaV1 | null {
  const parsed = MetaV1Schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Migrate a raw ProjectsV1 candidate. v1 -> v1 is a no-op (mirrors migrateProgress).
 *
 * @param raw - Unknown JSON-parsed value (caller's responsibility to JSON.parse)
 * @returns ProjectsV1 on success, null on schema mismatch
 */
export function migrateProjects(raw: unknown): ProjectsV1 | null {
  const parsed = ProjectsV1Schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
