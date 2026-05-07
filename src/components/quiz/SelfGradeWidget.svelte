<script lang="ts">
  type SelfVerdict = 'self-correct' | 'self-partial' | 'self-missed';

  let { onLockVerdict }: { onLockVerdict: (v: SelfVerdict) => void } = $props();

  let chosen = $state<SelfVerdict | null>(null);

  function lock(v: SelfVerdict): void {
    if (chosen !== null) return; // D-70: locked once chosen, no undo
    chosen = v;
    onLockVerdict(v);
  }

  const OPTIONS = [
    { label: 'Got it',     verdict: 'self-correct' as const },
    { label: 'Partial',    verdict: 'self-partial' as const },
    { label: 'Missed it',  verdict: 'self-missed'  as const },
  ];
</script>

<div class="mt-4 flex flex-row gap-4" role="group" aria-label="Self-grade your answer">
  {#each OPTIONS as opt}
    <button
      type="button"
      disabled={chosen !== null && chosen !== opt.verdict}
      onclick={() => lock(opt.verdict)}
      class:active={chosen === opt.verdict}
      class="px-4 py-2 bg-[var(--color-surface)] text-[var(--color-fg)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
    >
      {opt.label}
    </button>
  {/each}
</div>

<style>
  .active {
    background: var(--color-accent);
    color: var(--color-bg);
  }
</style>
