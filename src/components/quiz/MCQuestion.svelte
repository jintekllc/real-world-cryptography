<script lang="ts">
  import type { Question, Answer } from '~/lib/types';

  let { question, onSubmit }: {
    question: Extract<Question, { kind: 'mc' }>;
    onSubmit: (answer: Extract<Answer, { kind: 'mc' }>) => void;
  } = $props();

  let selected = $state<number | null>(null);
</script>

<fieldset class="bg-[var(--color-surface)] p-6 -mx-6 sm:mx-0">
  <legend class="text-base">{question.prompt}</legend>
  {#each question.choices as choice, i (i)}
    <label class="block py-2">
      <input type="radio" bind:group={selected} value={i} />
      {choice}
    </label>
  {/each}
  <button
    type="button"
    disabled={selected === null}
    onclick={() => { if (selected !== null) onSubmit({ kind: 'mc', selected }); }}
    class="mt-4 px-4 py-2 bg-[var(--color-accent)] text-[var(--color-bg)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
  >
    Check answer
  </button>
</fieldset>
