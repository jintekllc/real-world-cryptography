<script lang="ts">
  import type { Question, GradeResult } from '~/lib/types';
  import SelfGradeWidget from './SelfGradeWidget.svelte';

  let { question, result, onSubmitText, onLockVerdict }: {
    question: Extract<Question, { kind: 'short' }>;
    result: GradeResult | null;
    onSubmitText: (text: string) => void;
    onLockVerdict: (v: 'self-correct' | 'self-partial' | 'self-missed') => void;
  } = $props();

  let text = $state('');
  // The reveal of the model answer + rubric + SelfGradeWidget is gated on
  // "user has clicked Check", not on `result !== null`. `result` only becomes
  // non-null after the SelfGradeWidget locks a verdict, which itself requires
  // the widget to be visible — gating on result alone is a deadlock.
  let submitted = $state(false);

  // Reset local state when the parent advances to a new short question
  // (cursor++ in QuizRunner reuses this component instance for the next
  // question of the same kind).
  $effect(() => {
    question.id;
    submitted = false;
    text = '';
  });

  function handleCheck(): void {
    submitted = true;
    onSubmitText(text);
  }
</script>

<fieldset class="bg-[var(--color-surface)] p-6 -mx-6 sm:mx-0">
  <legend class="text-base">{question.prompt}</legend>
  <input
    type="text"
    bind:value={text}
    placeholder="Type your answer"
    class="block w-full mt-4 p-2 bg-[var(--color-bg)] text-[var(--color-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
  />
  {#if !submitted}
    <button
      type="button"
      disabled={text.trim() === ''}
      onclick={handleCheck}
      class="mt-4 px-4 py-2 bg-[var(--color-accent)] text-[var(--color-bg)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
    >
      Check answer
    </button>
  {:else}
    <h3 class="mt-6 text-sm font-semibold">Compare your answer:</h3>
    <p class="mt-2 leading-relaxed">{question.modelAnswer}</p>
    <h3 class="mt-4 text-sm font-semibold">Concepts to check:</h3>
    <ul class="mt-2 space-y-1">
      {#each question.rubric as bullet}
        <li>· {bullet}</li>
      {/each}
    </ul>
    <SelfGradeWidget onLockVerdict={onLockVerdict} />
  {/if}
</fieldset>
