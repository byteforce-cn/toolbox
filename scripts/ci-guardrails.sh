#!/usr/bin/env bash
# Engineering guardrails — run in CI to prevent tech debt backflow.
#
# Usage:
#   ./scripts/ci-guardrails.sh
#
# Exit codes:
#   0 — all checks passed
#   1 — one or more guardrails tripped
set -euo pipefail

FAIL=0
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.."\ && pwd)"
cd "$REPO_ROOT"

# ── 1. Large file check ──────────────────────────────────────────────────────
# Flag TypeScript source files > 500 lines in high-risk source directories.
# Threshold is intentionally generous; tighten as codebase matures.

MAX_LINES=500
LARGE_FILES=()

while IFS= read -r f; do
    lines=$(wc -l < "$f")
    if (( lines > MAX_LINES )); then
        LARGE_FILES+=("$f ($lines lines)")
    fi
done < <(find src -name '*.ts' -o -name '*.tsx' | grep -v '\.test\.' | grep -v '\.d\.ts')

if (( ${#LARGE_FILES[@]} > 0 )); then
    echo -e "${YELLOW}[WARN] Large source files (>${MAX_LINES} lines):${NC}"
    for entry in "${LARGE_FILES[@]}"; do
        echo "  - $entry"
    done
    # Warning only — does not fail the build yet.
    # Uncomment the next line to make this a hard gate:
    # FAIL=1
fi

# ── 2. TypeScript type-check gate ────────────────────────────────────────────
# Ensure the codebase compiles without type errors.

echo "Running TypeScript type check..."
if pnpm exec tsc --noEmit 2>&1; then
    echo -e "${GREEN}[OK] TypeScript type check passed${NC}"
else
    echo -e "${RED}[FAIL] TypeScript type errors found${NC}"
    FAIL=1
fi

# ── 3. Unit test gate ────────────────────────────────────────────────────────
# Ensure all unit tests pass.

echo "Running unit tests..."
if pnpm test 2>&1; then
    echo -e "${GREEN}[OK] All tests passed${NC}"
else
    echo -e "${RED}[FAIL] Tests failed${NC}"
    FAIL=1
fi

# ── 4. Test coverage gate ─────────────────────────────────────────────────────
# Ensure key test files exist for modules that have business logic.

REQUIRED_TESTS=(
    "src/store/changeset-store.test.ts"
    "src/modules/explorer/utils/tree-projection.test.ts"
    "src/modules/settings/views/settings-layout.test.ts"
    "src/modules/skills/views/skills-settings-utils.test.ts"
)

MISSING_TESTS=()
for test_file in "${REQUIRED_TESTS[@]}"; do
    if [[ ! -f "$test_file" ]]; then
        MISSING_TESTS+=("$test_file")
    fi
done

if (( ${#MISSING_TESTS[@]} > 0 )); then
    echo -e "${RED}[FAIL] Missing required test files:${NC}"
    for entry in "${MISSING_TESTS[@]}"; do
        echo "  - $entry"
    done
    FAIL=1
else
    echo -e "${GREEN}[OK] All required test files present${NC}"
fi

# ── 5. No new 'as any' / @ts-ignore in production code ───────────────────────
# Double-check for type-safety escapes in production source.

AS_ANY_COUNT=$(grep -rn 'as any\|@ts-ignore\|@ts-expect-error' src \
    --include='*.ts' --include='*.tsx' \
    2>/dev/null | grep -v '\.test\.' | grep -v '// SAFE:' | wc -l | tr -d ' ') || AS_ANY_COUNT=0

AS_ANY_BASELINE=20  # Current known count; decrease over time.

if (( AS_ANY_COUNT > AS_ANY_BASELINE )); then
    echo -e "${RED}[FAIL] Type-safety escape count ($AS_ANY_COUNT) exceeds baseline ($AS_ANY_BASELINE).${NC}"
    echo "       Review new 'as any' / @ts-ignore / @ts-expect-error additions."
    FAIL=1
else
    echo -e "${GREEN}[OK] Type-safety escapes: $AS_ANY_COUNT (baseline: $AS_ANY_BASELINE)${NC}"
fi

# ── 6. No private registry references in public source ───────────────────────
# Ensure no accidental byteforce-private registry references leak into TS source.

PRIVATE_REF_COUNT=$(grep -rn 'byteforce-private\|registry.byteforce' src \
    --include='*.ts' --include='*.tsx' --include='*.json' \
    2>/dev/null | wc -l | tr -d ' ') || PRIVATE_REF_COUNT=0

if (( PRIVATE_REF_COUNT > 0 )); then
    echo -e "${RED}[FAIL] Found $PRIVATE_REF_COUNT private registry references in source code.${NC}"
    grep -rn 'byteforce-private\|registry.byteforce' src --include='*.ts' --include='*.tsx' --include='*.json' 2>/dev/null || true
    FAIL=1
else
    echo -e "${GREEN}[OK] No private registry references in source${NC}"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

if (( FAIL )); then
    echo -e "\n${RED}Guardrail checks FAILED${NC}"
    exit 1
else
    echo -e "\n${GREEN}All guardrail checks passed${NC}"
    exit 0
fi
