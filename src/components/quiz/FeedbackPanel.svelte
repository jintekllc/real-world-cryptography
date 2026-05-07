<script lang="ts">
  import type { GradeResult, Question } from '~/lib/types';

  let { result, question }: {
    result: GradeResult | null;
    question: Question;
  } = $props();

  function announceFor(r: GradeResult | null): string {
    if (r === null) return '';
    if (r.verdict === 'correct') return 'Correct.';
    if (r.verdict === 'incorrect') return 'Incorrect.';
    return ''; // self-* verdicts are user-chosen — do not double-announce
  }

  let announcement = $derived(announceFor(result));

  function correctAnswerText(): string | null {
    if (result === null) return null;
    if (result.verdict !== 'incorrect') return null;
    if (question.kind === 'mc') {
      const choice = question.choices[question.answerIndex];
      return choice ?? '';
    }
    if (question.kind === 'tf') return String(question.answer);
    return null;
  }

  let correctAnswer = $derived(correctAnswerText());
</script>

<!-- Pre-rendered EMPTY at hydration; written into on grade. Pitfall §4 — NVDA -->
<!-- ignores live regions added to the DOM after mount. WARNING-6 fix: the -->
<!-- live region is sr-only so screen readers announce the verdict ONCE while -->
<!-- the visible accent-rail panel below carries the same string for sighted -->
<!-- users — no double rendering for either audience. Tailwind 4's `sr-only` -->
<!-- utility is provided by `@import "tailwindcss"` in src/styles/global.css. -->
<!-- If the executor finds `sr-only` is somehow stripped (it should not be), -->
<!-- the inline-equivalent fallback is: -->
<!--   class="absolute w-px h-px overflow-hidden whitespace-nowrap border-0" -->
<!--   plus a `clip-path: inset(50%)` style. Default expectation is that -->
<!--   `class="sr-only"` works out of the box. -->
<div role="status" aria-live="polite" class="sr-only">
  {announcement}
</div>

{#if result !== null}
  <div class="mt-2 bg-[var(--color-surface)] p-6 -mx-6 sm:mx-0 border-l-2 border-l-[var(--color-accent)]">
    <p class="leading-relaxed">{announcement}</p>
    {#if correctAnswer !== null}
      <p class="mt-2 text-sm text-[var(--color-muted)]">
        Correct answer: {correctAnswer}
      </p>
    {/if}
    {#if question.explanation}
      <p class="mt-2 leading-relaxed">{question.explanation}</p>
    {/if}
  </div>
{/if}
