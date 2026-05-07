<script lang="ts">
  import type { Question, Answer, GradeResult, Assessment } from '~/lib/types';
  import { withBase } from '~/lib/url';

  let { questions, answers, results, assessment, score, onRetake }: {
    questions: Question[];
    answers: (Answer | null)[];
    results: (GradeResult | null)[];
    assessment: Assessment;
    score: number;
    onRetake: () => void;
  } = $props();

  let pct = $derived(Math.round(score * 100));
  let thresholdPct = $derived(Math.round(assessment.passThreshold * 100));
  let passed = $derived(score >= assessment.passThreshold);
  let correctCount = $derived(
    results.filter((r) => r?.verdict === 'correct' || r?.verdict === 'self-correct').length,
  );

  // Pattern S4 / D-58 — chapterId derives from assessment.id by splitting on '-'.
  // Falls back to '/' if no chapter prefix can be parsed.
  function backHref(id: string): string {
    const ch = id.split('-')[0];
    if (ch !== undefined && /^ch\d{2}$/.test(ch)) {
      return withBase(`/chapters/${ch}/`);
    }
    return withBase('/');
  }

  function answerText(q: Question, a: Answer | null): string {
    if (a === null) return '(no answer)';
    if (a.kind === 'mc' && q.kind === 'mc') {
      return q.choices[a.selected] ?? String(a.selected);
    }
    if (a.kind === 'tf') return String(a.selected);
    if (a.kind === 'short' || a.kind === 'code') return a.text;
    return '';
  }

  function correctAnswerText(q: Question): string | null {
    if (q.kind === 'mc') return q.choices[q.answerIndex] ?? null;
    if (q.kind === 'tf') return String(q.answer);
    if (q.kind === 'code' && q.autoGrade === true) return q.referenceAnswer;
    return null; // self-graded short / non-autograde code: model answer block sits below instead
  }
</script>

<section class="bg-[var(--color-surface)] p-8 -mx-6 sm:mx-0">
  <h2 class:passed-color={passed} class="text-xl font-semibold">
    {passed ? `PASSED — ${pct}%` : `DID NOT PASS — ${pct}%`}
  </h2>
  <p class="text-sm text-[var(--color-muted)] mt-2">
    {correctCount} of {questions.length} correct · pass threshold {thresholdPct}%
  </p>

  <h3 class="mt-12 text-xl font-semibold">Review</h3>
  <ul class="mt-4 space-y-12">
    {#each questions as q, i (q.id)}
      <li>
        <h4 class="text-sm font-semibold">Question {i + 1}</h4>
        <p class="mt-2 leading-relaxed">{q.prompt}</p>
        <p class="mt-2 text-sm text-[var(--color-muted)]">
          Your answer: {answerText(q, answers[i] ?? null)}
        </p>
        {#if correctAnswerText(q) !== null}
          <p class="mt-2 text-sm text-[var(--color-muted)]">
            Correct answer: {correctAnswerText(q)}
          </p>
        {/if}
        {#if q.explanation}
          <p class="mt-2 leading-relaxed">{q.explanation}</p>
        {/if}
      </li>
    {/each}
  </ul>

  <div class="mt-12 flex flex-row gap-4">
    <button
      type="button"
      onclick={onRetake}
      class="px-4 py-2 bg-[var(--color-accent)] text-[var(--color-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
    >
      Retake →
    </button>
    <a
      href={backHref(assessment.id)}
      class="text-[var(--color-accent)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
    >
      ← Back to chapter
    </a>
  </div>
</section>

<style>
  .passed-color {
    color: var(--color-accent);
  }
</style>
