<script lang="ts">
  import {
    safeRead,
    safeWrite,
    clearAll,
    ProgressV1Schema,
    MetaV1Schema,
    ProjectsV1Schema,
    type MetaV1,
  } from '~/lib/progress';
  import { withBase } from '~/lib/url';

  type Phase = 'initial' | 'confirming' | 'cleared';

  let phase = $state<Phase>('initial');
  let lastResetAt = $state<string | null>(null);

  function computeSummary(): { attempts: number; assessments: number; projectMarks: number } {
    const p = safeRead('rwc:progress:v1', ProgressV1Schema);
    const proj = safeRead('rwc:projects:v1', ProjectsV1Schema);
    const assessments = p === null ? 0 : Object.keys(p.assessments).length;
    // WARNING-5 fix (Phase 4 D-72): mergeAttempt always pushes the new attempt
    // onto recent[], including the one that becomes `best`. Summing recent[].length
    // already covers every persisted attempt; adding `+ 1` for `best` would double-count.
    const attempts = p === null
      ? 0
      : Object.values(p.assessments).reduce((acc, a) => acc + a.recent.length, 0);
    // D-99.2 + UI-SPEC §Reset-progress copy update: count records where
    // started OR completed is true (records with both false are functionally
    // "never touched" and should not be counted as cleared).
    const projectMarks = proj === null
      ? 0
      : Object.values(proj.projects).filter((r) => r.started || r.completed).length;
    return { attempts, assessments, projectMarks };
  }

  let summary = $derived(computeSummary());

  // UI-SPEC §Reset-progress copy update — four cases (D-99.2). Order matters:
  // both-empty case first, then the two single-clause cases, then the both-present case.
  let summaryText = $derived.by(() => {
    if (summary.attempts === 0 && summary.projectMarks === 0) {
      return 'No attempts saved yet — nothing to clear.';
    }
    if (summary.projectMarks === 0) {
      return `${summary.attempts} quiz attempts will be cleared.`;
    }
    if (summary.attempts === 0) {
      return `${summary.projectMarks} coding-project marks will be cleared.`;
    }
    return `${summary.attempts} quiz attempts and ${summary.projectMarks} coding-project marks will be cleared.`;
  });
  let canWipe = $derived(summary.attempts > 0 || summary.projectMarks > 0);

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
    <p class="mt-4 leading-relaxed">{summaryText}</p>
    <div class="mt-6 flex flex-row gap-4">
      <button
        type="button"
        onclick={wipe}
        disabled={!canWipe}
        aria-disabled={!canWipe}
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
