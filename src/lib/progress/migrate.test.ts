// src/lib/progress/migrate.test.ts
//
// Phase 7 Plan 02 / Task 1 (TEST-02): Pin migrateProgress / migrateMeta /
// migrateProjects to v1 -> v1 no-op + v2 / malformed rejection. v2 will
// dispatch on raw.version; today both branches return safeParse(v1) result.
//
// Default Vitest env is 'node' (these helpers don't touch the DOM).

import { describe, it, expect } from 'vitest';
import { migrateProgress, migrateMeta, migrateProjects } from './migrate';
import type { ProgressV1, MetaV1, ProjectsV1 } from './schema';

// =============================================================
// Fixtures — minimal but schema-valid samples for each v1 shape.
// =============================================================

const validProgress: ProgressV1 = {
  version: 1,
  assessments: {
    'hello-crypto-quiz': {
      best: {
        attemptId: '01HZX0AAAAAAAAAAAAAAAAAAAA',
        completedAt: '2026-05-11T00:00:00.000Z',
        score: 0.8,
        passed: true,
        perQuestion: { 'ch00-q01': 'correct' },
      },
      recent: [
        {
          attemptId: '01HZX0AAAAAAAAAAAAAAAAAAAA',
          completedAt: '2026-05-11T00:00:00.000Z',
          score: 0.8,
          passed: true,
          perQuestion: { 'ch00-q01': 'correct' },
        },
      ],
    },
  },
};

const validMeta: MetaV1 = {
  version: 1,
  studentName: 'alice',
  firstSeenAt: '2026-05-11T00:00:00.000Z',
  lastResetAt: null,
};

const validProjects: ProjectsV1 = {
  version: 1,
  projects: {
    'aes-from-scratch': {
      started: true,
      completed: false,
      updatedAt: '2026-05-11T00:00:00.000Z',
    },
  },
};

// =============================================================
// migrateProgress
// =============================================================

describe('migrateProgress (v1 -> v1 no-op)', () => {
  it('valid v1 passes through unchanged (deep equal)', () => {
    expect(migrateProgress(validProgress)).toEqual(validProgress);
  });

  it('v2 candidate returns null (literal lock)', () => {
    expect(migrateProgress({ ...validProgress, version: 2 })).toBeNull();
  });

  it('empty object returns null (missing required fields)', () => {
    expect(migrateProgress({})).toBeNull();
  });

  it('null returns null (defensive)', () => {
    expect(migrateProgress(null)).toBeNull();
  });
});

// =============================================================
// migrateMeta
// =============================================================

describe('migrateMeta (v1 -> v1 no-op)', () => {
  it('valid v1 passes through unchanged (deep equal)', () => {
    expect(migrateMeta(validMeta)).toEqual(validMeta);
  });

  it('v2 candidate returns null (literal lock)', () => {
    expect(migrateMeta({ ...validMeta, version: 2 })).toBeNull();
  });

  it('non-ISO firstSeenAt returns null (datetime format check)', () => {
    expect(migrateMeta({ ...validMeta, firstSeenAt: 'not-iso' })).toBeNull();
  });
});

// =============================================================
// migrateProjects
// =============================================================

describe('migrateProjects (v1 -> v1 no-op)', () => {
  it('valid v1 passes through unchanged (deep equal)', () => {
    expect(migrateProjects(validProjects)).toEqual(validProjects);
  });

  it('v2 candidate returns null (literal lock)', () => {
    expect(migrateProjects({ ...validProjects, version: 2 })).toBeNull();
  });

  it('non-kebab-case project id returns null (key regex)', () => {
    expect(
      migrateProjects({
        version: 1,
        projects: {
          NotKebab: {
            started: true,
            completed: false,
            updatedAt: '2026-05-11T00:00:00.000Z',
          },
        },
      }),
    ).toBeNull();
  });
});
