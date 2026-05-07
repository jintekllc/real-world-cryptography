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
# Rationale: LIB-01 + D-60. Runtime imports from 'astro:content' are limited to:
#   - src/content.config.ts        (defineCollection schema authority)
#   - src/lib/questionSource.ts    (the v1 questions/assessments wrapper)
#   - src/pages/                   (D-60 — pages may read 'chapters' directly)
# Type-only imports (`import type { ... } from 'astro:content'`) are permitted
# everywhere — they erase at compile time and don't violate the chokepoint.
# G2b (below) further restricts pages from reading 'questions'/'assessments'.
echo "  [G2] astro:content chokepoint (LIB-01, D-60 relaxation for src/pages/; type-only imports permitted everywhere)"
G2_OUT=$(grep -rn "from 'astro:content'" src/ 2>/dev/null \
  | grep -v 'src/lib/questionSource.ts' \
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
echo "  [G2b] pages may not read questions/assessments collections (D-29, D-60)"
G2b_OUT=$(grep -rEn "getCollection\(['\"](questions|assessments)" src/pages/ 2>/dev/null || true)
if [ -n "$G2b_OUT" ]; then
  echo "    FAIL: pages directly reading questions/assessments — go through QuestionSource:"
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
# Gate G5 (Phase 3): No client:* directives or <script> blocks in src/
# -----------------------------------------------------------------------------
# Rationale: D-61 + PAGE-05 — Phase 3 ships zero JS. Any client:* directive
# or <script> block in src/pages/, src/components/, or src/layouts/ violates
# the zero-JS guarantee. Phase 4+ will narrow this gate to "non-quiz routes
# only" by excluding src/pages/assessments/[assessmentId]/ etc.
#
# Implementation note: two simpler positive checks (one for client:* and one
# for script blocks) are easier to debug than a single combined regex. Each
# grep is scoped to the three Phase-3-relevant directories.
echo "  [G5] no client:* / no script in Phase 3 source (D-61, PAGE-05)"
G5a_OUT=$(grep -rEn 'client:(load|idle|visible|media|only)' src/pages/ src/components/ src/layouts/ 2>/dev/null || true)
# G5b narrowed (Phase 4 wave-2 prep, D-86 partial): the <script> ban applies to
# .astro files only — .svelte files use <script> as their standard component
# syntax (Svelte runes live there). The full G5 narrowing (G5a removal + this
# G5b scope) is finished in plan 04-05; this minimal narrowing unblocks Wave 2's
# leaf .svelte components without changing G5a's behavior on .astro files.
G5b_OUT=$(grep -rn '<script' src/pages/ src/components/ src/layouts/ --include='*.astro' 2>/dev/null || true)
G5_FAIL=0
if [ -n "$G5a_OUT" ]; then
  echo "    FAIL: client:* directive found:"
  echo "$G5a_OUT" | sed 's/^/      /'
  G5_FAIL=1
  FAIL=1
fi
if [ -n "$G5b_OUT" ]; then
  echo "    FAIL: script element found:"
  echo "$G5b_OUT" | sed 's/^/      /'
  G5_FAIL=1
  FAIL=1
fi
if [ "$G5_FAIL" -eq 0 ]; then
  echo "    OK"
fi

# -----------------------------------------------------------------------------
# Gate G6 (Phase 3): Post-build — no HTML loads JS + Phase 3 routes emitted
# -----------------------------------------------------------------------------
# PAGE-05 literal contract: "the network panel shows no JS bundles loaded for
# non-quiz routes." The assertion is about what HTML *references*, not what
# files *exist* in dist/. The @astrojs/svelte integration (locked in Phase 1
# for Phase 4's QuizRunner) emits a 24KB Svelte runtime to dist/_astro/ even
# when no Phase 3 page uses `client:*` — but if no HTML <script src> or
# <link rel> points at it, the runtime is dead bundle weight, not loaded JS.
# Phase 3 form: zero `.js`/`.mjs` references in any emitted HTML.
# Phase 4+ form: same, with quiz routes allow-listed once QuizRunner ships.
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
echo "  [G6] no HTML loads JS + Phase 3 route enumeration (PAGE-05, PAGE-04)"
if [ -d "dist" ]; then
  G6_JS_REFS=$(grep -rEln '<script[^>]+src=|<link[^>]+rel="modulepreload"|\.m?js"' dist --include='*.html' 2>/dev/null || true)
  G6_FAIL=0
  if [ -n "$G6_JS_REFS" ]; then
    echo "    FAIL: HTML pages load JS bundles — PAGE-05 / D-61 violated:"
    echo "$G6_JS_REFS" | sed 's/^/      /'
    G6_FAIL=1
    FAIL=1
  fi
  # Resolve dist/ to whichever subdir Astro emits ('' or 'real-world-cryptography'
  # depending on base config). Astro 6 with base: '/real-world-cryptography' emits
  # dist/<base>/index.html.
  DIST_ROOT="dist"
  if [ -f "dist/real-world-cryptography/index.html" ]; then
    DIST_ROOT="dist/real-world-cryptography"
  fi
  # Cross-cutting (non-per-chapter) routes — hand-listed because they don't
  # vary per chapter. 1 homepage + 1 chapter index + 5 assessments + 1 fixture
  # + 1 coding-project + 1 reset = 10 paths.
  REQUIRED_FIXED_ROUTES=(
    "index.html"
    "chapters/index.html"
    "assessments/part-1-test/index.html"
    "assessments/part-1-challenge/index.html"
    "assessments/part-2-test/index.html"
    "assessments/part-2-challenge/index.html"
    "assessments/final-exam/index.html"
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
    echo "    OK ($ROUTE_COUNT routes verified, no HTML loads JS)"
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
