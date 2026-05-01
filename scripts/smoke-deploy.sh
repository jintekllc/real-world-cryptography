#!/usr/bin/env bash
#
# scripts/smoke-deploy.sh
#
# Phase 1 production smoke harness. Run after the first successful deploy
# (manually) and after any future deploy where you want to re-verify the
# Pages artifact is consistent.
#
# In Phase 7, this script will be wired into a post-deploy CI step.
# In Phase 1 it is run manually.
#
# Usage:
#   bash scripts/smoke-deploy.sh
#
# Exits 0 on full pass, non-zero with a diagnostic on any failure.

set -euo pipefail

# D-01: + D-02:: production URL derived from repo path jintekllc/real-world-cryptography
BASE="https://jintekllc.github.io/real-world-cryptography/"
BAD_PATH="${BASE}this-route-does-not-exist/"

echo "==> Smoke testing ${BASE}"

# 1. Landing page returns 200 + text/html
echo "    [1/4] GET ${BASE}"
HTML=$(curl -fsSL "$BASE")
if [[ -z "$HTML" ]]; then
  echo "FAIL: empty body from $BASE" >&2
  exit 1
fi

# 2. HTML references at least one _astro/* asset
echo "    [2/4] HTML references _astro/*"
if ! echo "$HTML" | grep -q '_astro/'; then
  echo "FAIL: no _astro/* asset reference in landing HTML — check astro build emitted hashed assets" >&2
  exit 2
fi

# 3. Discovered _astro asset URL returns 200 (proves .nojekyll worked — D-04:)
ASSET_PATH=$(echo "$HTML" | grep -oE '/real-world-cryptography/_astro/[a-zA-Z0-9._-]+' | head -n1)
if [[ -z "$ASSET_PATH" ]]; then
  echo "FAIL: could not extract a /real-world-cryptography/_astro/* asset path from HTML" >&2
  exit 3
fi
ASSET_URL="https://jintekllc.github.io${ASSET_PATH}"
echo "    [3/4] HEAD ${ASSET_URL}"
if ! curl -fsI "$ASSET_URL" >/dev/null; then
  echo "FAIL: asset 404 at $ASSET_URL — .nojekyll likely missing or Pages still serving Jekyll-stripped artifact (D-04: regression)" >&2
  exit 4
fi

# 4. A bad path returns 404
echo "    [4/4] GET ${BAD_PATH} (expect 404)"
STATUS=$(curl -fso /dev/null -w '%{http_code}' "$BAD_PATH" || true)
if [[ "$STATUS" != "404" ]]; then
  echo "FAIL: bad path returned HTTP $STATUS, expected 404 — verify dist/404.html exists" >&2
  exit 5
fi

echo "==> OK: smoke passed"
echo "    Production URL:  $BASE"
echo "    Verified asset:  $ASSET_URL"
echo "    404 behavior:    HTTP 404 on $BAD_PATH"
