#!/usr/bin/env bash
# scripts/gates.sh
#
# Chokepoint gate runner for Phase 2. Enforces the four hand-grep gates
# documented in .planning/phases/02-content-schema-library-interfaces/02-VALIDATION.md
# "Hand-Grep Chokepoint Gates" section.
#
# Gates:
#   G1  (D-33, LIB-03): only src/lib/progress/ touches localStorage
#   G2  (LIB-01, D-60): astro:content runtime imports limited to
#                        src/lib/questionSource.ts + src/content.config.ts +
#                        src/pages/ (chapters reads — D-60 Phase 3 relaxation);
#                        type-only imports permitted everywhere
#   G2b (D-29, D-60):   src/pages/ may NOT call getCollection('questions')
#                        or getCollection('assessments') — chokepoint preserved
#   G3  (D-41):         no Astro.glob() anywhere
#   G4  (D-39):         no `import { z } from 'astro:content'` (use astro/zod)
#   G5  (D-61, PAGE-05): no <script> blocks and no client:* directives in
#                        src/pages/, src/components/, src/layouts/ (Phase 3 zero-JS)
#   G6  (D-61, PAGE-05): post-build assertion — zero .js/.mjs in dist/
#                        AND every Phase 3 route emitted
#
# Exit codes:
#   0 — all four gates pass (no violations)
#   1 — at least one gate found a violation (printed to stderr)
#
# Usage:
#   bash scripts/gates.sh         # local check
#   pnpm gates                    # via package.json script alias
#   .github/workflows/ci.yml      # runs in PR CI before astro check
#   .github/workflows/deploy.yml  # runs on main before build

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Track failures so we can report all four gates in one run instead of
# bailing on the first violation. set -e is then bypassed for the grep
# checks themselves; we set the FAIL flag and decide at the end.
set +e
FAIL=0

echo "==> Running chokepoint gates (Phase 1 + 2 + 3)"

# -----------------------------------------------------------------------------
# Gate G1: NO direct localStorage access outside src/lib/progress/
# -----------------------------------------------------------------------------
# Rationale: D-33 + LIB-03 — the ProgressV1 chokepoint owns rwc:*:v1 keys.
# Any stray localStorage.X() call in a Svelte island, .astro page, or other
# .ts/.js file is a violation that Phase 4+ must catch BEFORE merge.
echo "  [G1] localStorage chokepoint (D-33)"
G1_OUT=$(grep -rn 'localStorage' src/ 2>/dev/null | grep -v 'src/lib/progress/' || true)
if [ -n "$G1_OUT" ]; then
  echo "    FAIL: localStorage references outside src/lib/progress/:"
  echo "$G1_OUT" | sed 's/^/      /'
  FAIL=1
else
  echo "    OK"
fi

# -----------------------------------------------------------------------------
# Gate G2: astro:content runtime imports only in allowed locations
# -----------------------------------------------------------------------------
# Rationale: LIB-01 + D-60 + D-99.1. Runtime imports from 'astro:content' are
# limited to:
#   - src/content.config.ts            (defineCollection schema authority)
#   - src/lib/questionSource.ts        (the v1 questions/assessments wrapper)
#   - src/lib/codingProjectSource.ts   (D-99.1 sibling chokepoint for codingProjects)
#   - src/pages/                       (D-60 — pages may read 'chapters' directly)
# Type-only imports (`import type { ... } from 'astro:content'`) are permitted
# everywhere — they erase at compile time and don't violate the chokepoint.
# G2b (below) further restricts pages from reading 'questions'/'assessments'.
echo "  [G2] astro:content chokepoint (LIB-01, D-60 relaxation for src/pages/; type-only imports permitted everywhere)"
G2_OUT=$(grep -rn "from 'astro:content'" src/ 2>/dev/null \
  | grep -v 'src/lib/questionSource.ts' \
  | grep -v 'src/lib/codingProjectSource.ts' \
  | grep -v 'src/content.config.ts' \
  | grep -v 'src/pages/' \
  | grep -v 'import type' || true)
if [ -n "$G2_OUT" ]; then
  echo "    FAIL: astro:content runtime imports outside allowed locations:"
  echo "$G2_OUT" | sed 's/^/      /'
  FAIL=1
else
  echo "    OK"
fi

# -----------------------------------------------------------------------------
# Gate G2b: src/pages/ may NOT call getCollection('questions'|'assessments')
# -----------------------------------------------------------------------------
# Rationale: D-29 + D-60 — pages may read 'chapters' directly (D-60), but
# 'questions' / 'assessments' reads remain the chokepoint domain of
# src/lib/questionSource.ts. Phase 4+ adds new pages (quiz routes); this
# gate keeps them from drifting into direct collection reads.
echo "  [G2b] pages may not read questions/assessments/codingProjects collections (D-29, D-60, D-99.1)"
G2b_OUT=$(grep -rEn "getCollection\(['\"](questions|assessments|codingProjects)" src/pages/ 2>/dev/null || true)
if [ -n "$G2b_OUT" ]; then
  echo "    FAIL: pages directly reading questions/assessments/codingProjects — go through the appropriate chokepoint:"
  echo "$G2b_OUT" | sed 's/^/      /'
  FAIL=1
else
  echo "    OK"
fi

# -----------------------------------------------------------------------------
# Gate G3: NO Astro.glob() anywhere
# -----------------------------------------------------------------------------
# Rationale: D-41 + Pitfall 11.2 — Astro.glob() is removed in Astro 6.
# Modern equivalents: getCollection() (for content) or import.meta.glob() (Vite).
#
# Implementation note: the ban is on the call form `Astro.glob(...)` — a bare
# identifier reference like `Astro.glob` in a documentation comment is not a
# violation (and can't be: it's prose, not executable code). The regex
# `Astro\.glob[[:space:]]*\(` matches `Astro.glob(` and `Astro.glob (` (any
# whitespace before the paren), covering the actual API call surface while
# allowing prose mentions inside `// ...` comments that describe the rule.
echo "  [G3] no Astro.glob() (D-41)"
G3_OUT=$(grep -rEn 'Astro\.glob[[:space:]]*\(' src/ 2>/dev/null || true)
if [ -n "$G3_OUT" ]; then
  echo "    FAIL: Astro.glob() usage found:"
  echo "$G3_OUT" | sed 's/^/      /'
  FAIL=1
else
  echo "    OK"
fi

# -----------------------------------------------------------------------------
# Gate G4: NO `import { z } from 'astro:content'`
# -----------------------------------------------------------------------------
# Rationale: D-39 + Pitfall 11.1 — Zod is re-exported from astro/zod, NOT
# astro:content (deprecated in Astro 6). Pre-Astro-6 tutorials still use
# astro:content; this gate catches drift.
echo "  [G4] z imported from astro/zod, not astro:content (D-39)"
G4_OUT=$(grep -rEn "import.*\bz\b.*from[[:space:]]+['\"]astro:content['\"]" src/ 2>/dev/null || true)
if [ -n "$G4_OUT" ]; then
  echo "    FAIL: 'z' imported from astro:content (use astro/zod instead):"
  echo "$G4_OUT" | sed 's/^/      /'
  FAIL=1
else
  echo "    OK"
fi

# -----------------------------------------------------------------------------
# Gate G5 (Phase 4 narrowed): client:* allowed; <script> banned in .astro only
# -----------------------------------------------------------------------------
# Rationale: D-86 + PATTERNS.md "G5 narrowing" section. Phase 4 mounts three
# Svelte islands via client:visible / client:idle directives in:
#   - src/layouts/BaseLayout.astro     (ProgressBadge client:idle, site-wide)
#   - src/pages/assessments/hello-crypto-quiz/index.astro   (QuizRunner)
#   - src/pages/assessments/[assessmentId]/index.astro      (QuizRunner cond.)
#   - src/pages/reset/index.astro      (ResetProgress)
# These directives are LEGITIMATE — the previous Phase-3 G5a ban no longer
# matches the contract. G5b (no inline <script> blocks in .astro pages) stays
# in force: Astro pages must remain server-rendered shells; any per-page
# scripting belongs in a Svelte island. The grep narrows to *.astro because
# .svelte files NATURALLY begin with <script lang="ts"> as part of Svelte's
# component syntax — banning <script> in .svelte would be incoherent.
echo "  [G5] no <script> in .astro source; client:* permitted on islands (D-86, Phase 4)"
G5b_OUT=$(grep -rn '<script' src/pages/ src/components/ src/layouts/ --include='*.astro' 2>/dev/null || true)
if [ -n "$G5b_OUT" ]; then
  echo "    FAIL: <script> element found in .astro file (use a Svelte island instead):"
  echo "$G5b_OUT" | sed 's/^/      /'
  FAIL=1
else
  echo "    OK"
fi

# -----------------------------------------------------------------------------
# Gate G6 (Phase 4 narrowed): route enumeration (post-build)
# -----------------------------------------------------------------------------
# PAGE-05's original "network panel shows no JS bundles loaded for non-quiz
# routes" no longer holds in Phase 4: <ProgressBadge client:idle /> is mounted
# in BaseLayout (used by every page), so JS ships site-wide.
#
# G6 retains ONE assertion: every required route is emitted to dist/. The
# route-enumeration loop below is the binding contract for PAGE-04 + PAGE-05's
# completeness criterion (no per-chapter dropouts). The "no HTML loads JS"
# assertion is intentionally removed (see Phase 4 PATTERNS.md G5/G6 section).
#
# Route enumeration is driven by `dist/<base>/chapters/` directory listing —
# we discover every chXX subdirectory Astro actually emitted, then assert that:
#   - chapters/{ch}/index.html exists for each emitted chapter
#   - assessments/{ch}-quiz/index.html exists (for ch01..ch16 only — ch00 maps
#     to assessments/hello-crypto-quiz/ per D-49)
#   - assessments/{ch}-challenge/index.html exists (same — ch01..ch16)
# This loop catches per-chapter dropouts (e.g., a filter bug that excludes
# ch07-quiz) that a hand-listed subset would miss.
#
# Requires `pnpm build` to have run first; SKIPS quietly if dist/ does not exist
# (so `pnpm gates` (pre-build) and `pnpm gates:dist` (post-build) share gates.sh).
echo "  [G6] route enumeration (PAGE-04, PAGE-05 — Phase 4 narrowed)"
if [ -d "dist" ]; then
  # Phase 4: G6's "no HTML loads JS" assertion is REMOVED. With <ProgressBadge
  # client:idle /> mounted in BaseLayout (Wave 4), every page that uses the
  # layout now references the Svelte runtime in its emitted HTML. The honest
  # narrowing is: drop the assertion. The route-enumeration loop below is
  # preserved as the catch for per-chapter dropouts.
  G6_FAIL=0
  # Resolve dist/ to whichever subdir Astro emits ('' or 'real-world-cryptography'
  # depending on base config). Astro 6 with base: '/real-world-cryptography' emits
  # dist/<base>/index.html.
  DIST_ROOT="dist"
  if [ -f "dist/real-world-cryptography/index.html" ]; then
    DIST_ROOT="dist/real-world-cryptography"
  fi
  # Cross-cutting (non-per-chapter) routes — hand-listed because they don't
  # vary per chapter. 1 homepage + 1 chapter index + 1 assessments index +
  # 4 cross-cutting assessments + 1 final-exam interstitial + 1 final-exam
  # runner + 1 fixture + 1 coding-project + 1 reset = 12 paths (Phase 5 D-96.2 +
  # D-97.5 + D-101 added 2 vs Phase 4's 10).
  REQUIRED_FIXED_ROUTES=(
    "index.html"
    "chapters/index.html"
    "assessments/index.html"                              # Phase 5 D-96.2 — assessments listing
    "assessments/part-1-required/index.html"              # Phase 5 D-101 — renamed from part-1-test
    "assessments/part-1-challenge/index.html"
    "assessments/part-2-required/index.html"              # Phase 5 D-101 — renamed from part-2-test
    "assessments/part-2-challenge/index.html"
    "assessments/final-exam/index.html"                   # Phase 5 D-97.5 — server-only interstitial
    "assessments/final-exam/start/index.html"             # Phase 5 D-97.5 — runner route (RESEARCH Pattern 1)
    "assessments/hello-crypto-quiz/index.html"
    "coding-project/index.html"
    "reset/index.html"
  )
  ROUTE_COUNT=0
  for r in "${REQUIRED_FIXED_ROUTES[@]}"; do
    if [ ! -f "$DIST_ROOT/$r" ]; then
      echo "    FAIL: missing emitted route: $DIST_ROOT/$r"
      G6_FAIL=1
      FAIL=1
    else
      ROUTE_COUNT=$((ROUTE_COUNT + 1))
    fi
  done
  # Per-chapter route enumeration: discover every chXX directory Astro emitted
  # under dist/<base>/chapters/, then assert quiz+challenge routes for each
  # cohort chapter (ch01..ch16). ch00 is excluded from quiz/challenge enumeration
  # because its assessment URL is /assessments/hello-crypto-quiz/ (D-49).
  if [ -d "$DIST_ROOT/chapters" ]; then
    for chdir in "$DIST_ROOT"/chapters/ch*/; do
      [ -d "$chdir" ] || continue
      ch=$(basename "$chdir")
      # 1) assert chapter detail HTML
      if [ ! -f "$chdir/index.html" ]; then
        echo "    FAIL: missing emitted route: $chdir/index.html"
        G6_FAIL=1
        FAIL=1
      else
        ROUTE_COUNT=$((ROUTE_COUNT + 1))
      fi
      # 2) assert per-chapter quiz + challenge for cohort chapters (ch01..ch16)
      if [ "$ch" != "ch00" ]; then
        for kind in quiz challenge; do
          path="$DIST_ROOT/assessments/${ch}-${kind}/index.html"
          if [ ! -f "$path" ]; then
            echo "    FAIL: missing emitted route: $path"
            G6_FAIL=1
            FAIL=1
          else
            ROUTE_COUNT=$((ROUTE_COUNT + 1))
          fi
        done
      fi
    done
  else
    echo "    FAIL: missing emitted directory: $DIST_ROOT/chapters/"
    G6_FAIL=1
    FAIL=1
  fi
  if [ "$G6_FAIL" -eq 0 ]; then
    echo "    OK ($ROUTE_COUNT routes verified)"
  fi
else
  echo "    SKIP (dist/ not built — run 'pnpm gates:dist' to build first)"
fi

# -----------------------------------------------------------------------------
# Final report
# -----------------------------------------------------------------------------
echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "==> All chokepoint gates passed (G1, G2, G2b, G3, G4, G5, G6)"
  exit 0
else
  echo "==> CHOKEPOINT GATE FAILURE — see violations above" >&2
  exit 1
fi
