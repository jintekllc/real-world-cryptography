<script lang="ts">
  import {
    safeRead,
    safeWrite,
    clearAll,
    ProgressV1Schema,
    MetaV1Schema,
    type MetaV1,
  } from '~/lib/progress';
  import { withBase } from '~/lib/url';

  type Phase = 'initial' | 'confirming' | 'cleared';

  let phase = $state<Phase>('initial');
  let lastResetAt = $state<string | null>(null);

  function computeSummary(): { attempts: number; assessments: number } {
    const p = safeRead('rwc:progress:v1', ProgressV1Schema);
    if (p === null) return { attempts: 0, assessments: 0 };
    const assessmentCount = Object.keys(p.assessments).length;
    // WARNING-5 fix: mergeAttempt always pushes the new attempt onto recent[],
    // including the one that becomes `best`. Summing recent[].length already
    // covers every persisted attempt; adding `+ 1` for `best` would double-count.
    const attempts = Object.values(p.assessments)
      .reduce((acc, a) => acc + a.recent.length, 0);
    return { attempts, assessments: assessmentCount };
  }

  let summary = $derived(computeSummary());

  function wipe(): void {
    clearAll();
    const existing = safeRead('rwc:meta:v1', MetaV1Schema);
    const stamp = new Date().toISOString();
    const next: MetaV1 = existing === null
      ? {
          version: 1,
          studentName: '',
          firstSeenAt: stamp,
          lastResetAt: stamp,
        }
      : { ...existing, lastResetAt: stamp };
    safeWrite('rwc:meta:v1', next, MetaV1Schema);
    lastResetAt = stamp;
    phase = 'cleared';
  }
</script>

<h1 class="text-3xl font-semibold">Reset progress</h1>
<p class="text-sm text-[var(--color-muted)] mt-2">
  Wipes attempt history. Your saved name is kept.
</p>

{#if phase === 'initial'}
  <button
    type="button"
    onclick={() => { phase = 'confirming'; }}
    class="mt-8 px-4 py-2 bg-[var(--color-surface)] text-[var(--color-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
  >
    Reset progress…
  </button>
{:else if phase === 'confirming'}
  <section class="mt-8 bg-[var(--color-surface)] p-6 -mx-6 sm:mx-0 border-l-2 border-l-[var(--color-accent)]">
    <h2 class="text-xl font-semibold">Confirm reset</h2>
    <p class="mt-4 leading-relaxed">
      {summary.attempts === 0
        ? 'No attempts saved yet — nothing to clear.'
        : `${summary.attempts} attempts across ${summary.assessments} assessments will be cleared.`}
    </p>
    <div class="mt-6 flex flex-row gap-4">
      <button
        type="button"
        onclick={wipe}
        disabled={summary.attempts === 0}
        aria-disabled={summary.attempts === 0}
        class="px-4 py-2 bg-[var(--color-accent-dim)] text-[var(--color-fg)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
      >
        Yes, wipe
      </button>
      <button
        type="button"
        onclick={() => { phase = 'initial'; }}
        class="text-[var(--color-muted)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
      >
        Keep my progress
      </button>
    </div>
  </section>
{:else}
  <section class="mt-8 bg-[var(--color-surface)] p-6 -mx-6 sm:mx-0">
    <h2 class="text-xl font-semibold">Progress cleared.</h2>
    <p class="mt-2 leading-relaxed">Your saved name was kept.</p>
    <p class="mt-2 text-sm text-[var(--color-muted-2)]">Cleared {lastResetAt}</p>
    <p class="mt-8">
      <a
        href={withBase('/')}
        class="text-[var(--color-accent)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
      >
        ← Back to home
      </a>
    </p>
  </section>
{/if}
