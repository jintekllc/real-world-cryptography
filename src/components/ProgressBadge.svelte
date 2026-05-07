<script lang="ts">
  import { safeRead, ProgressV1Schema } from '~/lib/progress';

  function inject(): void {
    const progress = safeRead('rwc:progress:v1', ProgressV1Schema);
    if (progress === null) return;
    const slots = document.querySelectorAll<HTMLElement>('[data-rwc-badge]');
    for (const slot of slots) {
      const id = slot.dataset.rwcBadge;
      if (id === undefined) continue;
      const entry = progress.assessments[id];
      if (entry === undefined) {
        slot.textContent = '';      // D-75 — never-attempted slots stay empty
        continue;
      }
      const pct = Math.round(entry.best.score * 100);
      slot.innerHTML = entry.best.passed
        ? `<span class="text-[var(--color-accent)]">●</span> <span class="text-sm">${pct}%</span>`
        : `<span class="text-[var(--color-muted)]">○</span> <span class="text-sm text-[var(--color-muted)]">${pct}%</span>`;
    }
  }

  $effect(() => {
    inject();
    const handler = (e: StorageEvent): void => {
      if (e.key !== null && e.key.startsWith('rwc:')) inject();
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  });
</script>

<!-- This island has no rendered output of its own — it injects into pre-positioned -->
<!-- [data-rwc-badge] slots placed by ChapterCard.astro and ChapterFooterNav.astro. -->
<div hidden aria-hidden="true"></div>
