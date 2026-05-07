<script lang="ts">
  import type { Question, GradeResult } from '~/lib/types';
  import SelfGradeWidget from './SelfGradeWidget.svelte';

  let { question, result, codeBlockHtml = '', onSubmitText, onLockVerdict }: {
    question: Extract<Question, { kind: 'code' }>;
    result: GradeResult | null;
    codeBlockHtml?: string;     // D-94: pre-rendered Expressive Code HTML, build-time-trusted
    onSubmitText: (text: string) => void;
    onLockVerdict: (v: 'self-correct' | 'self-partial' | 'self-missed') => void;
  } = $props();

  let text = $state('');
</script>

<fieldset class="bg-[var(--color-surface)] p-6 -mx-6 sm:mx-0">
  <legend class="text-base">{question.prompt}</legend>
  {#if codeBlockHtml !== ''}
    <div class="mt-4">{@html codeBlockHtml}</div>
  {/if}
  <input
    type="text"
    bind:value={text}
    placeholder="Type your answer"
    class="block w-full mt-4 p-2 bg-[var(--color-bg)] text-[var(--color-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
  />
  {#if result === null}
    <button
      type="button"
      disabled={text.trim() === ''}
      onclick={() => onSubmitText(text)}
      class="mt-4 px-4 py-2 bg-[var(--color-accent)] text-[var(--color-bg)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
    >
      Check answer
    </button>
  {:else if question.autoGrade === true}
    <p class="text-sm text-[var(--color-muted)] mt-2">
      Submitted: {result.normalized}
    </p>
    {#if result.verdict === 'incorrect'}
      <p class="text-sm text-[var(--color-muted)] mt-2">
        Reference: {question.referenceAnswer}
      </p>
    {/if}
  {:else}
    <h3 class="mt-6 text-sm font-semibold">Compare your answer:</h3>
    <p class="mt-2 leading-relaxed">{question.referenceAnswer}</p>
    <SelfGradeWidget onLockVerdict={onLockVerdict} />
  {/if}
</fieldset>
