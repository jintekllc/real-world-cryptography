<script lang="ts">
  // src/components/CodingProjectToggles.svelte
  //
  // Slot-scan Svelte 5 island: hydrates [data-rwc-project-toggle] slots on
  // /coding-project/ with two native <input type="checkbox"> elements
  // (`Started`, `Completed`). Cross-tab sync via storage event (D-99.5
  // narrowed filter — only re-acts to 'rwc:projects:v1' changes; ignores
  // ProgressBadge's 'rwc:progress:v1').
  //
  // CONTRACT (D-98.3, D-99.1, D-99.5):
  //   - Auto-rule (Completed=true forces Started=true) is applied at WRITE
  //     time via applyToggle() — NOT in a $derived. Storage IS truth.
  //   - Distinct slot attribute name from ProgressBadge (this island uses
  //     [data-rwc-project-toggle] vs the badge attribute) — D-99.5 collision avoidance.
  //   - All storage I/O via the chokepoint (~/lib/progress); NEVER direct
  //     window storage access — G1 enforces this.

  import {
    safeRead,
    safeWrite,
    ProjectsV1Schema,
    type ProjectsV1,
  } from '~/lib/progress';
  import { applyToggle } from '~/lib/projects/toggle';

  function readState(): ProjectsV1 {
    const s = safeRead('rwc:projects:v1', ProjectsV1Schema);
    return s ?? { version: 1, projects: {} };
  }

  function inject(): void {
    const state = readState();
    const slots = document.querySelectorAll<HTMLElement>('[data-rwc-project-toggle]');
    for (const slot of slots) {
      const projectId = slot.dataset.rwcProjectToggle;
      if (projectId === undefined) continue;
      const record = state.projects[projectId] ?? { started: false, completed: false, updatedAt: '' };

      // Build the two-checkbox markup. We use plain template strings + DOM
      // assignment (matching ProgressBadge's pattern) so the island stays
      // tiny and we don't need a child component for two checkboxes.
      slot.innerHTML = `
        <div class="flex flex-col gap-4">
          <label class="inline-flex items-center gap-2 py-2 cursor-pointer">
            <input
              type="checkbox"
              data-rwc-toggle-field="started"
              data-rwc-toggle-id="${projectId}"
              ${record.started ? 'checked' : ''}
              style="accent-color: var(--color-accent);"
              class="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            />
            <span class="text-sm">Started</span>
          </label>
          <label class="inline-flex items-center gap-2 py-2 cursor-pointer">
            <input
              type="checkbox"
              data-rwc-toggle-field="completed"
              data-rwc-toggle-id="${projectId}"
              ${record.completed ? 'checked' : ''}
              style="accent-color: var(--color-accent);"
              class="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            />
            <span class="text-sm">Completed</span>
          </label>
        </div>
      `;
    }
  }

  function onChange(e: Event): void {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.type !== 'checkbox') return;
    const field = target.dataset.rwcToggleField;
    const projectId = target.dataset.rwcToggleId;
    if ((field !== 'started' && field !== 'completed') || projectId === undefined) return;

    const current = readState();
    const next = applyToggle(current, projectId, field, target.checked);
    safeWrite('rwc:projects:v1', next, ProjectsV1Schema);   // D-81 silent on failure
    // Re-paint immediately so the auto-rule (Completed → Started=true) is
    // visible in this tab before the storage event round-trips.
    inject();
  }

  $effect(() => {
    inject();
    document.addEventListener('change', onChange);
    const handler = (e: StorageEvent): void => {
      // D-99.5 narrowed filter — this island only cares about its own key.
      if (e.key === 'rwc:projects:v1') inject();
    };
    window.addEventListener('storage', handler);
    return () => {
      document.removeEventListener('change', onChange);
      window.removeEventListener('storage', handler);
    };
  });
</script>

<!-- This island has no rendered output of its own — it injects into pre-positioned -->
<!-- [data-rwc-project-toggle] slots placed by CodingProjectCard.astro. -->
<div hidden aria-hidden="true"></div>
