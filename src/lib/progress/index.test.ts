// @vitest-environment happy-dom
//
// src/lib/progress/index.test.ts
//
// Phase 7 Plan 02 / Task 3 (TEST-02): Pin the ProgressV1 chokepoint
// (safeRead / safeWrite / clearAll) fail-soft contract under a real
// browser-like DOM. happy-dom provides window.localStorage as a real
// `Storage` implementation AND `DOMException` so the quota path can be
// exercised exactly the way a browser would dispatch it.
//
// The chokepoint uses a module-scoped closure cache + initialized flag
// (initOnce runs ONCE per module load). Tests that need a fresh cache
// must call vi.resetModules() + dynamic import — that is the Vitest 4
// supported pattern for re-running module-top-level state.
//
// Pitfall 11.3 / Research §11.3: env MUST be 'happy-dom' for this file
// because (a) safeRead/Write touch window.localStorage and (b) the quota
// branch uses `err instanceof DOMException` which is undefined under env
// 'node'. The pragma above is therefore load-bearing.
//
// Spy target gotcha (discovered while building this file): happy-dom
// exposes `localStorage.setItem` as a BOUND method on the instance — the
// instance's own setItem reference does NOT equal `Storage.prototype.setItem`.
// Spying on the prototype therefore has no effect on the production call
// path `window.localStorage.setItem(...)`. We spy on the instance
// (`window.localStorage`, the same object getStorage() returns) instead.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MetaV1, ProgressV1 } from './schema';
import { MetaV1Schema, ProgressV1Schema } from './schema';

// =============================================================
// Fixtures
// =============================================================

const validMeta: MetaV1 = {
  version: 1,
  studentName: 'alice',
  firstSeenAt: '2026-05-11T00:00:00.000Z',
  lastResetAt: null,
};

const validProgress: ProgressV1 = {
  version: 1,
  assessments: {},
};

/**
 * Re-import the chokepoint module after resetting Vitest's module registry.
 * Required because index.ts uses a module-scoped closure cache + initialized
 * flag — every test that wants `initOnce` to re-run against fresh storage
 * needs a fresh module instance.
 */
async function freshModule() {
  vi.resetModules();
  return await import('./index');
}

// =============================================================
// safeRead / safeWrite happy paths
// =============================================================

describe('safeRead / safeWrite happy paths', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('safeRead returns null on missing key (no warn)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { safeRead } = await freshModule();
    expect(safeRead('rwc:meta:v1', MetaV1Schema)).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('safeWrite then safeRead round-trips the validated value', async () => {
    const { safeRead, safeWrite } = await freshModule();
    expect(safeWrite('rwc:meta:v1', validMeta, MetaV1Schema)).toBe(true);
    expect(safeRead('rwc:meta:v1', MetaV1Schema)).toEqual(validMeta);
  });

  it('safeRead hydrates from existing localStorage on first call (initOnce)', async () => {
    // Pre-seed storage BEFORE the chokepoint module loads so initOnce reads it.
    localStorage.setItem('rwc:meta:v1', JSON.stringify(validMeta));
    const { safeRead } = await freshModule();
    expect(safeRead('rwc:meta:v1', MetaV1Schema)).toEqual(validMeta);
  });
});

// =============================================================
// safeRead failure paths (parse error / schema mismatch)
// =============================================================

describe('safeRead failure paths', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns null + warns on JSON parse error', async () => {
    localStorage.setItem('rwc:progress:v1', 'not-valid-json{{{');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { safeRead } = await freshModule();
    expect(safeRead('rwc:progress:v1', ProgressV1Schema)).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/parse error/),
      expect.anything(),
    );
  });

  it('returns null + warns on schema mismatch (non-ISO datetime)', async () => {
    localStorage.setItem(
      'rwc:meta:v1',
      JSON.stringify({
        version: 1,
        studentName: 'x',
        firstSeenAt: 'bad-iso',
        lastResetAt: null,
      }),
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { safeRead } = await freshModule();
    expect(safeRead('rwc:meta:v1', MetaV1Schema)).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/schema mismatch/));
  });

  it('returns null + warns when caller schema rejects cached value (cache/schema mismatch)', async () => {
    // Defensive belt-and-braces branch: the cache was populated via initOnce()
    // against MetaV1Schema, but the caller passes ProgressV1Schema (a totally
    // different shape) — safeRead's per-call safeParse rejects it and warns.
    // This is the "caller-schema mismatch" path in safeRead (defensive narrowing).
    localStorage.setItem('rwc:meta:v1', JSON.stringify(validMeta));
    const { safeRead } = await freshModule();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Intentional schema-key mismatch: a Meta value cached at 'rwc:meta:v1',
    // queried with the wrong (Progress) schema. Cast widens the call so the
    // chokepoint actually receives the wrong schema at runtime.
    const result = (
      safeRead as unknown as (key: 'rwc:meta:v1', schema: typeof ProgressV1Schema) => unknown
    )('rwc:meta:v1', ProgressV1Schema);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/cache\/schema mismatch/),
    );
  });
});

// =============================================================
// safeWrite failure paths (schema fail / quota / storage-disabled)
// =============================================================

describe('safeWrite failure paths', () => {
  // Instance-level spies on happy-dom's Storage Proxy are NOT cleaned up by
  // vi.restoreAllMocks() (the Proxy interception breaks Vitest's restore
  // tracking). Tests in this block must restore their setItem spy explicitly
  // in afterEach so the next describe block sees an un-tampered localStorage.
  let setItemSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    setItemSpy = null;
  });

  afterEach(() => {
    setItemSpy?.mockRestore();
    setItemSpy = null;
  });

  it('returns false + warns on schema fail; storage untouched', async () => {
    const { safeWrite } = await freshModule();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Spy on the localStorage INSTANCE — happy-dom's setItem is a bound
    // method per instance; spying on Storage.prototype.setItem does not
    // intercept calls made through window.localStorage.
    setItemSpy = vi.spyOn(window.localStorage, 'setItem');
    const ok = safeWrite(
      'rwc:meta:v1',
      { ...validMeta, firstSeenAt: 'not-iso' },
      MetaV1Schema,
    );
    expect(ok).toBe(false);
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/schema fail/),
      expect.anything(),
    );
  });

  it('returns false + warns on QuotaExceededError (real DOMException)', async () => {
    const { safeWrite } = await freshModule();
    // happy-dom provides a real DOMException — the chokepoint's quota detector
    // uses `err instanceof DOMException && err.name === 'QuotaExceededError'`
    // so this throw exercises the exact production branch.
    //
    // Spy on the localStorage INSTANCE (see file-level note); prototype-level
    // spies are no-ops under happy-dom's bound-method scheme.
    setItemSpy = vi
      .spyOn(window.localStorage, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('quota exceeded', 'QuotaExceededError');
      });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ok = safeWrite('rwc:meta:v1', validMeta, MetaV1Schema);
    expect(setItemSpy).toHaveBeenCalled();
    expect(ok).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/quota/i),
      expect.anything(),
    );
  });
});

// =============================================================
// clearAll — wipe all four rwc:*:v1 keys + reset the cache
// =============================================================

describe('clearAll', () => {
  // Instance spies on happy-dom's Storage Proxy aren't auto-restored — track
  // and explicitly restore (same rationale as the safeWrite failure paths).
  let removeItemSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    removeItemSpy = null;
  });

  afterEach(() => {
    removeItemSpy?.mockRestore();
    removeItemSpy = null;
  });

  it('removes all four rwc:*:v1 keys AND clears the in-memory cache', async () => {
    const { safeRead, safeWrite, clearAll } = await freshModule();

    // Seed the three writable keys via the chokepoint plus the reserved
    // notes key via direct localStorage (v1 has no notes writer).
    safeWrite('rwc:meta:v1', validMeta, MetaV1Schema);
    safeWrite('rwc:progress:v1', validProgress, ProgressV1Schema);
    localStorage.setItem('rwc:notes:v1', JSON.stringify({ stub: 'reserved' }));

    // Pre-condition: at least three keys are present in storage.
    expect(localStorage.getItem('rwc:meta:v1')).not.toBeNull();
    expect(localStorage.getItem('rwc:progress:v1')).not.toBeNull();
    expect(localStorage.getItem('rwc:notes:v1')).not.toBeNull();

    // Clear
    expect(clearAll()).toBe(true);

    // Post-condition: ALL four rwc:*:v1 keys gone from storage.
    expect(localStorage.getItem('rwc:meta:v1')).toBeNull();
    expect(localStorage.getItem('rwc:progress:v1')).toBeNull();
    expect(localStorage.getItem('rwc:projects:v1')).toBeNull();
    expect(localStorage.getItem('rwc:notes:v1')).toBeNull();

    // In-memory cache is also cleared: safeRead returns null without re-init.
    expect(safeRead('rwc:meta:v1', MetaV1Schema)).toBeNull();
    expect(safeRead('rwc:progress:v1', ProgressV1Schema)).toBeNull();
  });

  it('returns false + warns when storage.removeItem throws (catch branch)', async () => {
    const { clearAll } = await freshModule();
    removeItemSpy = vi
      .spyOn(window.localStorage, 'removeItem')
      .mockImplementation(() => {
        throw new Error('storage backend offline');
      });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(clearAll()).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/clearAll failed/),
      expect.anything(),
    );
  });
});

// =============================================================
// Storage-disabled environment (SSR / Safari ITP / private mode)
// =============================================================
//
// getStorage() returns null when (a) typeof window === 'undefined' (SSR) or
// (b) accessing window.localStorage throws (sandboxed iframe / Safari ITP).
// safeWrite hits the storage-unavailable branch (warns + returns false) and
// clearAll hits the silent-false branch (no warn).
//
// We exercise path (a) via `vi.stubGlobal('window', undefined)` which makes
// `typeof window === 'undefined'` true — exactly the Astro SSR shape.

describe('storage-disabled environment (SSR / private-mode path)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('safeWrite returns false + warns when window is undefined (SSR)', async () => {
    const { safeWrite } = await freshModule();
    // Replicate Astro SSR: typeof window === 'undefined'.
    vi.stubGlobal('window', undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ok = safeWrite('rwc:meta:v1', validMeta, MetaV1Schema);
    expect(ok).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/storage unavailable/),
    );
  });

  it('clearAll returns false silently when window is undefined (SSR)', async () => {
    const { clearAll } = await freshModule();
    vi.stubGlobal('window', undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(clearAll()).toBe(false);
    // No warn on the storage-unavailable path for clearAll (silent fail).
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('safeWrite returns false when window.localStorage access throws (Safari ITP / private mode)', async () => {
    const { safeWrite } = await freshModule();
    // Replicate the Safari ITP / sandboxed-iframe shape: window exists but
    // reading the `localStorage` property throws. getStorage's try/catch
    // returns null on this path (line 74 in index.ts).
    const fakeWindow = {} as Window & typeof globalThis;
    Object.defineProperty(fakeWindow, 'localStorage', {
      get() {
        throw new Error('SecurityError: cookies disabled');
      },
      configurable: true,
    });
    vi.stubGlobal('window', fakeWindow);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ok = safeWrite('rwc:meta:v1', validMeta, MetaV1Schema);
    expect(ok).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/storage unavailable/),
    );
  });
});
