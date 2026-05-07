<script lang="ts">
  import type { Question, Answer, GradeResult, Assessment, Verdict, AttemptRecord } from '~/lib/types';
  import { questionSource } from '~/lib/questionSource';
  import { grader } from '~/lib/grader';
  import { safeRead, safeWrite, ProgressV1Schema } from '~/lib/progress';
  import { scoreFromVerdicts } from '~/lib/quiz/score';
  import { mergeAttempt } from '~/lib/quiz/merge';
  import { ulid } from 'ulid';
  import { withBase } from '~/lib/url';
  import { tick } from 'svelte';

  import MCQuestion from './MCQuestion.svelte';
  import TFQuestion from './TFQuestion.svelte';
  import ShortQuestion from './ShortQuestion.svelte';
  import CodeQuestion from './CodeQuestion.svelte';
  import FeedbackPanel from './FeedbackPanel.svelte';
  import ReviewScreen from './ReviewScreen.svelte';

  let { assessmentId, codeBlockHtmlByQid = {} }: {
    assessmentId: string;
    codeBlockHtmlByQid?: Record<string, string>;     // D-94 — Wave 4 page shells supply this
  } = $props();

  // ===========================================================================
  // State
  // ===========================================================================
  let questions = $state<Question[]>([]);
  let assessment = $state<Assessment | null>(null);
  let loaded = $state(false);
  let cursor = $state(0);
  let answers = $state<(Answer | null)[]>([]);
  let results = $state<(GradeResult | null)[]>([]);
  let phase = $state<'answering' | 'graded' | 'review'>('answering');
  // Pending text from Short/Code's onSubmitText — held until self-verdict locks
  // (or undefined if the question is autoGrade and resolves immediately).
  let pendingText = $state<string | null>(null);
  let rootEl: HTMLElement | undefined = $state(undefined);
  // Bound to the `Next →` / `Finish →` button (the same element — its label is
  // derived). Used by the post-grade focus $effect below to satisfy QUIZ-09's
  // keyboard contract: after Short/Code self-grade locks (or MC/TF submit
  // resolves), focus moves to the just-rendered advance button so Enter
  // immediately progresses without a manual Tab walk.
  let nextBtnEl: HTMLButtonElement | undefined = $state(undefined);

  // ===========================================================================
  // Derived
  // ===========================================================================
  let total = $derived(questions.length);
  let current = $derived<Question | undefined>(questions[cursor]);
  let isLast = $derived(cursor === total - 1);
  let immediateFeedback = $derived(assessment?.feedbackMode !== 'end-only');
  let nextLabel = $derived(isLast ? 'Finish →' : 'Next →');
  let codeHtmlForCurrent = $derived(
    current !== undefined ? (codeBlockHtmlByQid[current.id] ?? '') : '',
  );

  // ===========================================================================
  // Mount: load questions + assessment
  // ===========================================================================
  $effect(() => {
    void (async () => {
      const [q, a] = await Promise.all([
        questionSource.getByAssessment(assessmentId),
        questionSource.getAssessment(assessmentId),
      ]);
      questions = q;
      assessment = a;
      answers = new Array(q.length).fill(null);
      results = new Array(q.length).fill(null);
      loaded = true;
    })();
  });

  // ===========================================================================
  // Post-grade focus management (QUIZ-09 keyboard contract).
  // When phase flips to 'graded', wait for Svelte to flush DOM updates (so the
  // conditionally-rendered `Next →` / `Finish →` button has actually mounted)
  // and move focus to it. The user can then press Enter to advance without
  // tabbing back to the new control.
  // ===========================================================================
  $effect(() => {
    if (phase === 'graded') {
      void tick().then(() => nextBtnEl?.focus());
    }
  });

  // ===========================================================================
  // Number-key shortcuts (UI-SPEC §Keyboard) — gated by event.target not being a
  // text input (Pitfall §5) AND the current question not yet being submitted.
  // ===========================================================================
  $effect(() => {
    function isTypingTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      if (t instanceof HTMLTextAreaElement) return true;
      if (t instanceof HTMLInputElement && (t.type === 'text' || t.type === 'search' || t.type === 'email' || t.type === 'url' || t.type === 'tel' || t.type === 'password')) {
        return true;
      }
      return false;
    }

    function handler(e: KeyboardEvent): void {
      // Restrict to keystrokes whose target is inside this island root.
      if (rootEl === undefined || !rootEl.contains(e.target as Node)) return;
      if (isTypingTarget(e.target)) return;
      if (current === undefined) return;
      if (phase !== 'answering') return;

      const digit = e.key.charCodeAt(0) - '0'.charCodeAt(0);
      if (digit < 1 || digit > 9) return;

      if (current.kind === 'mc' && digit - 1 < current.choices.length) {
        e.preventDefault();
        void submit({ kind: 'mc', selected: digit - 1 });
      } else if (current.kind === 'tf' && (digit === 1 || digit === 2)) {
        e.preventDefault();
        void submit({ kind: 'tf', selected: digit === 1 });
      }
      // Self-grade digit shortcuts (1/2/3 → Got it/Partial/Missed it) are
      // intentionally NOT handled here — they live inside SelfGradeWidget's
      // own focus area and the widget locks via onclick. Cohort feedback can
      // reopen this if needed.
    }

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  });

  // ===========================================================================
  // Submit handlers
  // ===========================================================================
  async function submit(answer: Answer): Promise<void> {
    if (current === undefined) return;
    const result = await grader.grade(current, answer);
    answers[cursor] = answer;
    results[cursor] = result;
    pendingText = null;
    phase = 'graded';
  }

  function onSubmitMC(answer: Extract<Answer, { kind: 'mc' }>): void {
    void submit(answer);
  }

  function onSubmitTF(answer: Extract<Answer, { kind: 'tf' }>): void {
    void submit(answer);
  }

  // Short ALWAYS waits for self-verdict; Code with autoGrade resolves
  // immediately on text submit; Code without autoGrade waits for self-verdict.
  function onShortSubmitText(text: string): void {
    pendingText = text;
  }

  function onCodeSubmitText(text: string): void {
    if (current === undefined) return;
    if (current.kind === 'code' && current.autoGrade === true) {
      void submit({ kind: 'code', text });
    } else {
      pendingText = text;
    }
  }

  function onLockShortVerdict(v: 'self-correct' | 'self-partial' | 'self-missed'): void {
    if (pendingText === null) return;
    void submit({ kind: 'short', text: pendingText, selfVerdict: v });
  }

  function onLockCodeVerdict(v: 'self-correct' | 'self-partial' | 'self-missed'): void {
    if (pendingText === null) return;
    void submit({ kind: 'code', text: pendingText, selfVerdict: v });
  }

  // ===========================================================================
  // Advance + finish
  // ===========================================================================
  function next(): void {
    if (isLast) {
      void finish();
      return;
    }
    cursor = cursor + 1;
    phase = 'answering';
    pendingText = null;
  }

  async function finish(): Promise<void> {
    if (assessment === null) return;
    const perQuestion: Record<string, Verdict> = {};
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const r = results[i];
      if (q !== undefined && r !== null) {
        perQuestion[q.id] = r.verdict;
      }
    }
    const score = scoreFromVerdicts(perQuestion);
    const attempt: AttemptRecord = {
      attemptId: ulid(),
      completedAt: new Date().toISOString(),
      score,
      passed: score >= assessment.passThreshold,
      perQuestion,
    };
    const existing = safeRead('rwc:progress:v1', ProgressV1Schema)
      ?? { version: 1 as const, assessments: {} };
    const merged = mergeAttempt(existing, assessmentId, attempt);
    safeWrite('rwc:progress:v1', merged, ProgressV1Schema);    // D-81: silent on failure
    phase = 'review';
  }

  function retake(): void {
    cursor = 0;
    answers = new Array(questions.length).fill(null);
    results = new Array(questions.length).fill(null);
    phase = 'answering';
    pendingText = null;
  }

  // ===========================================================================
  // Derived helpers for the review screen
  //
  // Use $derived.by(...) — NOT $derived(() => ...). The plain $derived form
  // would store the FUNCTION itself as the derived value (because the function
  // expression is the producer's return value), and the call site would have
  // to invoke it; worse, it would not re-evaluate when results[]/questions[]
  // mutate (because the function reference is stable). $derived.by reads the
  // body of the closure each time the dependencies change, which is what we
  // want for "re-compute the score whenever a new verdict lands."
  // ===========================================================================
  let reviewScore = $derived.by(() => {
    const perQuestion: Record<string, Verdict> = {};
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const r = results[i];
      if (q !== undefined && r !== null) perQuestion[q.id] = r.verdict;
    }
    return scoreFromVerdicts(perQuestion);
  });

  function chapterHrefFromAssessmentId(id: string): string {
    const ch = id.split('-')[0];
    if (ch !== undefined && /^ch\d{2}$/.test(ch)) {
      return withBase(`/chapters/${ch}/`);
    }
    return withBase('/');
  }
</script>

<div bind:this={rootEl}>
  {#if !loaded}
    <!-- Pre-data state — no spinner, no skeleton (UI-SPEC empty/loading). -->
    <div></div>
  {:else if questions.length === 0}
    <section class="bg-[var(--color-surface)] p-8 -mx-6 sm:mx-0">
      <h2 class="text-xl font-semibold">No questions yet.</h2>
      <p class="mt-2 leading-relaxed">
        This quiz will populate once Phase 6 generates its question bank.
      </p>
      <p class="mt-8">
        <a
          href={chapterHrefFromAssessmentId(assessmentId)}
          class="text-[var(--color-accent)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          ← Back to chapter
        </a>
      </p>
    </section>
  {:else if phase === 'review' && assessment !== null}
    <ReviewScreen
      questions={questions}
      answers={answers}
      results={results}
      assessment={assessment}
      score={reviewScore}
      onRetake={retake}
    />
  {:else if current !== undefined}
    <p class="text-sm text-[var(--color-muted)]">Question {cursor + 1} of {total}</p>

    {#if current.kind === 'mc'}
      <MCQuestion question={current} onSubmit={onSubmitMC} />
    {:else if current.kind === 'tf'}
      <TFQuestion question={current} onSubmit={onSubmitTF} />
    {:else if current.kind === 'short'}
      <ShortQuestion
        question={current}
        result={results[cursor] ?? null}
        onSubmitText={onShortSubmitText}
        onLockVerdict={onLockShortVerdict}
      />
    {:else if current.kind === 'code'}
      <CodeQuestion
        question={current}
        result={results[cursor] ?? null}
        codeBlockHtml={codeHtmlForCurrent}
        onSubmitText={onCodeSubmitText}
        onLockVerdict={onLockCodeVerdict}
      />
    {/if}

    {#if phase === 'graded' && immediateFeedback}
      <FeedbackPanel result={results[cursor] ?? null} question={current} />
      <button
        type="button"
        bind:this={nextBtnEl}
        onclick={next}
        class="mt-4 px-4 py-2 bg-[var(--color-accent)] text-[var(--color-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
      >
        {nextLabel}
      </button>
    {/if}
  {/if}
</div>
