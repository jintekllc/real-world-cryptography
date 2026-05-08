// src/lib/progress/index.ts
//
// safeRead / safeWrite / clearAll own all access to window.localStorage
// for keys 'rwc:progress:v1', 'rwc:meta:v1', 'rwc:projects:v1' (Phase 5
// D-99.1) — and 'rwc:notes:v1' clear-only.
//
// CONTRACT (D-33, D-36, LIB-03): this is the SINGLE chokepoint for
// localStorage. No other module under src/ may read or write
// window.localStorage for rwc:*:v1 keys. The grep gate G1 enforces this:
//     grep -rn 'localStorage' src/ | grep -v 'src/lib/progress/'
// must return zero matches.
//
// CONFLICT C-1 RESOLUTION:
// CONTEXT.md ## Claude's Discretion suggests creating a tiny src/lib/storage.ts
// shim wrapping globalThis.localStorage for SSR-safe access. RESEARCH.md §7
// lines 824-831 + PATTERNS.md C-1 (lines 689-700) recommend NO shim — inline
// the SSR guard inside this module's getStorage() function. Resolution:
// follow research. A separate storage.ts module would either (a) be imported
// only here (adds indirection without benefit) or (b) be imported elsewhere
// (violates chokepoint discipline). The getStorage() helper below is private
// to this file. Acceptance criterion: NO file src/lib/storage.ts exists.
//
// SSR-safety (Pitfall 11.3): every storage access is gated by getStorage()
// which inlines `typeof window !== 'undefined'`. Astro pre-renders all pages
// — module-top-level localStorage access would crash the build with
// `ReferenceError: localStorage is not defined`. The inline check (NOT
// extracted into a helper) lets bundlers statically eliminate the dead
// SSR branch.
//
// Behaviors (D-36 fail-soft contract):
//   safeRead<T>(key, schema): T | null
//     null on missing key, JSON parse error, schema mismatch, or
//     storage-disabled environment. Console.warns on every non-`missing`
//     failure path so dev mode surfaces issues.
//   safeWrite<T>(key, value, schema): boolean
//     Zod-validates, writes, updates in-memory cache atomically.
//     Returns false on QuotaExceededError or storage-disabled.
//   clearAll(): boolean
//     Removes all four rwc:*:v1 keys (rwc:progress:v1, rwc:projects:v1
//     [D-99.2 / Phase 5], rwc:meta:v1, and the reserved rwc:notes:v1)
//     and clears the cache.
//
// Migration (D-35): runs ONCE per session in initOnce(). Subsequent
// safeRead calls hit the in-memory cache. safeWrite updates both cache
// and storage atomically. v1 -> v1 is a no-op (migrate.ts).
//
// HMR caveat (Pitfall 11.11 — DEV-ONLY): the cache is closure-scoped. If a
// developer manually edits localStorage in DevTools while astro dev is
// running, initOnce() has already cached the old value. Production
// behavior is correct (one init per page load). No fix needed.

import { z } from 'astro/zod';
import { migrateProgress, migrateMeta, migrateProjects } from './migrate';
import { ProgressV1Schema, MetaV1Schema, ProjectsV1Schema } from './schema';
// Note: ProgressV1 / MetaV1 type aliases are re-exported below via
// `export type { ... } from './schema'`. No local `import type` needed
// because the type names are not referenced inside this module body —
// the public API uses generic <T> bindings, and the re-export pulls
// directly from './schema'. (verbatimModuleSyntax + ts(6192) compliance.)

// =============================================================
// SSR-safe storage handle (Conflict C-1 resolution: NO src/lib/storage.ts)
// =============================================================
// Inline check ONLY — do NOT extract into a helper module. Bundlers can
// statically eliminate the dead branch on the server when the check is
// inline at every access site (Pitfall 11.3).

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    // Sandboxed iframe / Safari ITP / private mode can throw on access.
    return null;
  }
}

// =============================================================
// In-memory cache (D-35 — migration runs ONCE per session)
// =============================================================

type CacheKey = 'rwc:progress:v1' | 'rwc:meta:v1' | 'rwc:projects:v1';
const cache = new Map<CacheKey, unknown>();
let initialized = false;

function initOnce(): void {
  if (initialized) return;
  initialized = true;
  const storage = getStorage();
  if (storage === null) return;

  // Read each known v1 key, validate, cache. Fail-soft on any error.
  for (const key of ['rwc:progress:v1', 'rwc:meta:v1', 'rwc:projects:v1'] as const) {
    try {
      const raw = storage.getItem(key);
      if (raw === null) continue;
      const parsed = JSON.parse(raw);
      const migrated =
        key === 'rwc:progress:v1' ? migrateProgress(parsed)
        : key === 'rwc:meta:v1'   ? migrateMeta(parsed)
        : migrateProjects(parsed);
      if (migrated !== null) cache.set(key, migrated);
      else console.warn(`[progress] schema mismatch on ${key}; ignoring`);
    } catch (err) {
      console.warn(`[progress] parse error on ${key}:`, err);
    }
  }
}

// =============================================================
// Public API (D-36 fail-soft contract)
// =============================================================

/**
 * Read + Zod-validate a v1 key. Returns null on missing key, parse error,
 * schema mismatch, or storage-disabled environment. Console-warns on every
 * non-`missing` failure path so dev mode surfaces issues.
 *
 * @param key - One of 'rwc:progress:v1' | 'rwc:meta:v1' | 'rwc:projects:v1' (CacheKey)
 * @param schema - Caller's Zod schema (re-validated against the cached value)
 * @returns Validated T on success, null on any failure path
 *
 * Behaviors:
 *   - First call: triggers initOnce() which reads + migrates + caches.
 *   - Subsequent calls: hit the in-memory cache. No re-migration.
 *   - Storage-disabled environment (SSR / Safari ITP): returns null silently
 *     (no warn — "missing" is the dominant case at first paint).
 *   - Schema mismatch on cached value: console.warns and returns null
 *     (defensive belt-and-braces against caller-schema mismatch).
 */
export function safeRead<T>(
  key: CacheKey,
  schema: z.ZodType<T>,
): T | null {
  initOnce();
  const cached = cache.get(key);
  if (cached === undefined) return null;
  // Cache holds already-validated values. Re-parse to satisfy the
  // caller-supplied schema's type contract (T is bound to caller's schema,
  // not the in-cache schema; defensive narrowing).
  const parsed = schema.safeParse(cached);
  if (!parsed.success) {
    console.warn(`[progress] cache/schema mismatch on ${key}`);
    return null;
  }
  return parsed.data;
}

/**
 * Zod-validate a value, then write to localStorage and update the in-memory
 * cache atomically. Returns true on success, false on QuotaExceededError or
 * storage-disabled environment. Console-warns on every failure path.
 *
 * @param key - One of 'rwc:progress:v1' | 'rwc:meta:v1' | 'rwc:projects:v1' (CacheKey)
 * @param value - The value to write (must satisfy schema)
 * @param schema - Caller's Zod schema (validated BEFORE the storage write)
 * @returns true on success, false on schema fail / quota / storage-disabled
 *
 * Behaviors:
 *   - Validates first (fail before side effect).
 *   - On success: writes JSON.stringify(parsed.data) to storage AND updates
 *     cache.set(key, parsed.data) — both succeed atomically.
 *   - QuotaExceededError detection: cross-browser DOMException check
 *     (.name 'QuotaExceededError' || 'NS_ERROR_DOM_QUOTA_REACHED' ||
 *      .code === 22 || .code === 1014).
 *   - SSR / storage-disabled: returns false silently after one warn.
 *
 * Threat T-2-01 mitigation: Zod-validation before write prevents the
 * chokepoint from ever writing schema-invalid data; safeRead's re-validation
 * catches values someone wrote outside the chokepoint (which Gate G1 forbids
 * but defense-in-depth catches anyway).
 */
export function safeWrite<T>(
  key: CacheKey,
  value: T,
  schema: z.ZodType<T>,
): boolean {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    console.warn(`[progress] safeWrite schema fail on ${key}:`, parsed.error);
    return false;
  }
  const storage = getStorage();
  if (storage === null) {
    console.warn(`[progress] safeWrite skipped on ${key}: storage unavailable`);
    return false;
  }
  try {
    storage.setItem(key, JSON.stringify(parsed.data));
    cache.set(key, parsed.data);
    return true;
  } catch (err) {
    // QuotaExceededError varies across browsers. Cross-browser feature detect.
    const isQuota =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        err.code === 22 || err.code === 1014);
    console.warn(`[progress] safeWrite ${isQuota ? 'quota' : 'error'} on ${key}:`, err);
    return false;
  }
}

/**
 * Clear all rwc:*:v1 keys (rwc:progress:v1, rwc:projects:v1 [D-99.2 /
 * Phase 5], rwc:meta:v1, and the reserved rwc:notes:v1) and clear the
 * in-memory cache. Called by the Phase 4 reset-progress button.
 *
 * @returns true on success, false on storage-disabled environment
 *
 * Note: rwc:notes:v1 is a RESERVED placeholder per D-33. Phase 2 does not
 * write it. clearAll removes it anyway as a defensive cleanup so a v2
 * NOTE-01 feature starting fresh sees no stale state from removed builds.
 *
 * Order note (D-99.2): rwc:meta:v1 is removed here AND immediately
 * re-stamped by ResetProgress.svelte's wipe() via safeWrite(meta) so that
 * studentName + firstSeenAt survive across reset and lastResetAt is fresh.
 * The clearAll -> safeWrite(meta) ordering is the binding contract; do not
 * reorder.
 */
export function clearAll(): boolean {
  const storage = getStorage();
  if (storage === null) return false;
  try {
    storage.removeItem('rwc:progress:v1');
    storage.removeItem('rwc:projects:v1');              // D-99.2 (Phase 5)
    storage.removeItem('rwc:meta:v1');
    storage.removeItem('rwc:notes:v1');                 // reserved (D-33)
    cache.clear();
    return true;
  } catch (err) {
    console.warn('[progress] clearAll failed:', err);
    return false;
  }
}

// Re-export schemas for callers that need the typed schema argument.
// (Phase 4 callers write `safeRead('rwc:progress:v1', ProgressV1Schema)` etc.;
// Phase 5 callers add `safeRead('rwc:projects:v1', ProjectsV1Schema)`.)
export { ProgressV1Schema, MetaV1Schema, ProjectsV1Schema };
export type { ProgressV1, MetaV1, ProjectsV1, ProjectRecord } from './schema';
