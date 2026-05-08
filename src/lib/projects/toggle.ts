// src/lib/projects/toggle.ts
//
// Pure helper: applies the D-98.3 auto-rule (ticking Completed forces Started
// to true) and returns a new ProjectsV1 state with the requested record
// updated. Used by CodingProjectToggles.svelte at WRITE time (Plan 05-04).
//
// CONTRACT (D-98.3):
//   - Setting `completed = true` ALSO sets `started = true` (auto-rule).
//   - Setting `started = false` does NOT auto-untick `completed` (legitimate
//     "completed but I want to revisit" state).
//   - Setting `completed = false` does NOT touch `started`.
//   - First-write for a projectId seeds { started: false, completed: false, updatedAt: '' }
//     before applying the field/value pair.
//
// `now` is injected so Phase 7 Vitest can pin timestamps deterministically.
//
// Phase 7 will Vitest this directly — keep it pure (no Date.now() in the hot
// path; no DOM; no storage I/O — that's the chokepoint's job).

import type { ProjectsV1 } from '~/lib/types';

export function applyToggle(
  state: ProjectsV1,
  projectId: string,
  field: 'started' | 'completed',
  value: boolean,
  now: () => string = () => new Date().toISOString(),
): ProjectsV1 {
  const existing = state.projects[projectId] ?? { started: false, completed: false, updatedAt: '' };
  const next = field === 'completed'
    ? {
        // D-98.3 auto-rule: completed=true forces started=true; completed=false leaves started alone.
        started: value === true ? true : existing.started,
        completed: value,
        updatedAt: now(),
      }
    : {
        started: value,
        completed: existing.completed,
        updatedAt: now(),
      };
  return {
    version: 1,
    projects: { ...state.projects, [projectId]: next },
  };
}
