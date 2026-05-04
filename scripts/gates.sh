#!/usr/bin/env bash
# scripts/gates.sh
#
# Chokepoint gate runner for Phase 2. Enforces the four hand-grep gates
# documented in .planning/phases/02-content-schema-library-interfaces/02-VALIDATION.md
# "Hand-Grep Chokepoint Gates" section.
#
# Gates:
#   G1 (D-33, LIB-03): only src/lib/progress/ touches localStorage
#   G2 (LIB-01):       only src/lib/questionSource.ts + src/content.config.ts
#                       import from 'astro:content'
#   G3 (D-41):         no Astro.glob() anywhere
#   G4 (D-39):         no `import { z } from 'astro:content'` (use astro/zod)
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

echo "==> Running chokepoint gates for Phase 2"

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
# Gate G2: NO direct astro:content imports outside questionSource.ts + content.config.ts
# -----------------------------------------------------------------------------
# Rationale: LIB-01 — every UI consumer of question data goes through the
# QuestionSource interface. The two exempt files are: src/content.config.ts
# (must import defineCollection from astro:content — schema authority) and
# src/lib/questionSource.ts (the v1 implementation that wraps getCollection
# and getEntry).
echo "  [G2] astro:content chokepoint (LIB-01)"
G2_OUT=$(grep -rn "from 'astro:content'" src/ 2>/dev/null \
  | grep -v 'src/lib/questionSource.ts' \
  | grep -v 'src/content.config.ts' || true)
if [ -n "$G2_OUT" ]; then
  echo "    FAIL: astro:content imports outside questionSource.ts/content.config.ts:"
  echo "$G2_OUT" | sed 's/^/      /'
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
# Final report
# -----------------------------------------------------------------------------
echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "==> All chokepoint gates passed (G1, G2, G3, G4)"
  exit 0
else
  echo "==> CHOKEPOINT GATE FAILURE — see violations above" >&2
  exit 1
fi
