<script lang="ts">
  import type { Question, Answer, GradeResult, Assessment, Verdict } from '~/lib/types';
  import { withBase } from '~/lib/url';
  import { partSubtotalFromVerdicts } from '~/lib/quiz/partSubtotal';
  import { chapterBreakdownFromVerdicts, type ChapterRow } from '~/lib/quiz/chapterBreakdown';

  let {
    questions,
    answers,
    results,
    assessment,
    score,
    onRetake,
    mode = 'standard',
    chapterToPart = {},
    chapterTitles = {},
  }: {
    questions: Question[];
    answers: (Answer | null)[];
    results: (GradeResult | null)[];
    assessment: Assessment;
    score: number;
    onRetake: () => void;
    mode?: 'standard' | 'final-exam';
    chapterToPart?: Record<string, 1 | 2>;
    chapterTitles?: Record<string, string>;
  } = $props();

  let pct = $derived(Math.round(score * 100));
  let thresholdPct = $derived(Math.round(assessment.passThreshold * 100));
  let passed = $derived(score >= assessment.passThreshold);
  let correctCount = $derived(
    results.filter((r) => r?.verdict === 'correct' || r?.verdict === 'self-correct').length,
  );

  // Build the verdict map once; both breakdown helpers consume it.
  let perQuestion = $derived.by(() => {
    const map: Record<string, Verdict> = {};
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const r = results[i];
      if (q !== undefined && r !== null) map[q.id] = r.verdict;
    }
    return map;
  });

  let partSubtotal = $derived(
    partSubtotalFromVerdicts(perQuestion, questions, chapterToPart),
  );

  let chapterRows = $derived<ChapterRow[]>(
    chapterBreakdownFromVerdicts(perQuestion, questions, chapterTitles, answers),
  );

  // backHref:
  //   - mode === 'final-exam' -> bottom secondary link returns to home (UI-SPEC step 7.7)
  //   - mode === 'standard'   -> existing chapter-derived behavior (D-58)
  let backTarget = $derived.by(() => {
    if (mode === 'final-exam') {
      return { href: withBase('/'), label: '← Back to home' };
    }
    const ch = assessment.id.split('-')[0];
    if (ch !== undefined && /^ch\d{2}$/.test(ch)) {
      return { href: withBase(`/chapters/${ch}/`), label: '← Back to chapter' };
    }
    return { href: withBase('/'), label: '← Back to home' };
  });

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

  {#if mode === 'final-exam'}
    <h3 class="mt-12 text-xl font-semibold">Per-part breakdown</h3>
    <p class="mt-4 text-sm text-[var(--color-muted)]">
      Part 1 — Primitives: {partSubtotal.part1.correct} / {partSubtotal.part1.total} correct
    </p>
    <p class="mt-4 text-sm text-[var(--color-muted)]">
      Part 2 — Protocols: {partSubtotal.part2.correct} / {partSubtotal.part2.total} correct
    </p>

    <h3 class="mt-12 text-xl font-semibold">Per-chapter breakdown</h3>
    {#each chapterRows as row (row.chapterId)}
      <details class="mt-4">
        <summary class="text-sm font-semibold cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]">
          Chapter {row.chapterId.replace(/^ch0?/, '')}: {row.title}
          <span class="text-[var(--color-muted-2)]">·</span>
          <span class="text-[var(--color-muted)]">{row.correct} / {row.total} correct</span>
        </summary>
        <div class="accordion-body mt-4 pl-4 space-y-12">
          {#each row.questionRows as qr, i (qr.q.id)}
            <div>
              <h4 class="text-sm font-semibold">Question {i + 1}</h4>
              <p class="mt-2 leading-relaxed">{qr.q.prompt}</p>
              <p class="mt-2 text-sm text-[var(--color-muted)]">
                Your answer: {answerText(qr.q, qr.answer)}
              </p>
              {#if correctAnswerText(qr.q) !== null}
                <p class="mt-2 text-sm text-[var(--color-muted)]">
                  Correct answer: {correctAnswerText(qr.q)}
                </p>
              {/if}
              {#if qr.q.explanation}
                <p class="mt-2 leading-relaxed">{qr.q.explanation}</p>
              {/if}
            </div>
          {/each}
        </div>
      </details>
    {/each}
  {:else}
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
  {/if}

  <div class="mt-12 flex flex-row gap-4">
    <button
      type="button"
      onclick={onRetake}
      class="px-4 py-2 bg-[var(--color-accent)] text-[var(--color-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
    >
      Retake →
    </button>
    <a
      href={backTarget.href}
      class="text-[var(--color-accent)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
    >
      {backTarget.label}
    </a>
  </div>
</section>

<style>
  .passed-color {
    color: var(--color-accent);
  }
  /* Accordion: hide default browser arrow; show our locked glyphs (UI-SPEC §Per-chapter accordion). */
  summary { list-style: none; }
  summary::-webkit-details-marker { display: none; }
  summary::before { content: '▶ '; color: var(--color-muted); }
  details[open] summary::before { content: '▼ '; color: var(--color-muted); }
  details[open] .accordion-body { border-left: 2px solid var(--color-accent); padding-left: 1rem; }
</style>
