<!-- src/components/exam/Certificate.svelte
     Final-exam completion certificate (EXAM-06).
     Mounted by ReviewScreen.svelte ONLY when mode === 'final-exam' && passed.
     Persists student name to the existing rwc:meta:v1 chokepoint key
     (RESEARCH §"storage key naming convention" + A3 — no new key).
     Print-friendly via a media-print rule in this component's <style> block. -->
<script lang="ts">
  import {
    safeRead,
    safeWrite,
    MetaV1Schema,
    type MetaV1,
  } from '~/lib/progress';

  let {
    score,
    assessmentTitle = 'Real-World Cryptography — Final Exam',
  }: {
    score: number;
    assessmentTitle?: string;
  } = $props();

  // ---------------------------------------------------------------------
  // Student name — REUSES the existing meta.studentName field.
  // No new persistence key (RESEARCH §A3); the chokepoint owns rwc:meta:v1.
  // ---------------------------------------------------------------------
  let name = $state('');
  let mounted = $state(false);

  // Hydrate from meta on mount; bind:value writes back via persistName onblur.
  $effect(() => {
    const meta = safeRead('rwc:meta:v1', MetaV1Schema);
    if (meta !== null) name = meta.studentName;
    mounted = true;
  });

  // Persist on blur to avoid thrashing storage on every keystroke.
  function persistName(): void {
    const existing = safeRead('rwc:meta:v1', MetaV1Schema);
    const stamp = new Date().toISOString();
    const next: MetaV1 = existing === null
      ? { version: 1, studentName: name, firstSeenAt: stamp, lastResetAt: null }
      : { ...existing, studentName: name };
    safeWrite('rwc:meta:v1', next, MetaV1Schema);
  }

  // ---------------------------------------------------------------------
  // Date stamp — only render after hydration so SSR + first client paint
  // emit the same DOM (Pitfall 4 in RESEARCH §Common Pitfalls).
  // ---------------------------------------------------------------------
  let dateText = $derived.by(() => {
    if (!mounted) return '';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date());
  });

  let pct = $derived(Math.round(score * 100));
</script>

<section
  data-rwc-certificate
  aria-label="Completion certificate"
  class="bg-[var(--color-surface)] p-12 mt-12 -mx-6 sm:mx-0 border-l-2 border-l-[var(--color-accent)]"
>
  <h2 class="text-2xl font-semibold text-[var(--color-fg)]">Certificate of Completion</h2>
  <p class="mt-4 text-sm text-[var(--color-muted)]">{assessmentTitle}</p>

  <label class="block mt-12">
    <span class="text-sm text-[var(--color-muted)]">Your name</span>
    <input
      type="text"
      bind:value={name}
      onblur={persistName}
      placeholder="Type your name"
      class="block w-full mt-2 p-2 bg-[var(--color-bg)] text-[var(--color-fg)] text-xl font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
    />
  </label>

  <p class="mt-12 text-sm text-[var(--color-muted)]">Completed</p>
  <p class="text-lg text-[var(--color-fg)]">{dateText}</p>

  <p class="mt-8 text-sm text-[var(--color-muted)]">Final score</p>
  <p class="text-lg text-[var(--color-fg)]">{pct}%</p>

  <p class="mt-12 text-xs text-[var(--color-muted-2)]">
    Real-World Cryptography Course · companion to David Wong's book
  </p>
</section>

<style>
  /* Screen view: inherits the site's terminal-green-on-near-black aesthetic.
     No overrides needed — the markup above uses --color-* tokens.

     Print view: high-contrast B&W. Tailwind v4 @theme tokens cascade through
     CSS custom properties, so we override the palette tokens inside @media
     print and the markup automatically picks up the new values. */
  @media print {
    section[data-rwc-certificate] {
      page-break-before: always;
      page-break-after: always;
      page-break-inside: avoid;
      --color-bg: #ffffff;
      --color-surface: #ffffff;
      --color-fg: #000000;
      --color-muted: #444444;
      --color-muted-2: #666666;
      --color-accent: #000000;
      background: white !important;
      color: black !important;
      border-left: 2px solid black;
      margin: 0;
      padding: 2cm;
      box-shadow: none;
    }

    /* Hide siblings of the certificate when printing. */
    section[data-rwc-certificate] ~ *,
    section[data-rwc-certificate] ~ * * {
      display: none !important;
    }

    /* Input renders its value as plain text in print (no border, no caret). */
    section[data-rwc-certificate] input[type="text"] {
      border: none !important;
      outline: none !important;
      background: white !important;
      color: black !important;
      padding: 0;
    }
  }
</style>
