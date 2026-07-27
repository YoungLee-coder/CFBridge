#!/bin/bash
# Format the just-edited file and run lightweight post-edit checks.
# Invoked by .claude/settings.json as a PostToolUse hook on Edit|MultiEdit|Write.
# Stdin is the Claude Code hook payload (JSON). Failures must never block the edit.
#
# This hook replaces the old format-on-edit.sh — it combines formatting
# with optional lightweight verification. The formatting logic is the same;
# the verification part is a quick lint/typecheck on the changed file only.
# Both phases fail silently: no project-specific edits required.

set -u

# Need jq to read the payload. No jq → do nothing, quietly.
command -v jq > /dev/null 2>&1 || exit 0

FILE=$(jq -r '.tool_input.file_path // empty' 2> /dev/null || true)
[[ -z "$FILE" ]] && exit 0
[[ ! -f "$FILE" ]] && exit 0

have() { command -v "$1" > /dev/null 2>&1; }

# ========================================
# Phase 1: Format (same as old format-on-edit.sh)
# ========================================

case "$FILE" in
    *.js | *.jsx | *.ts | *.tsx | *.mjs | *.cjs | *.json | *.css | *.scss | *.html | *.md | *.yaml | *.yml | *.vue | *.svelte)
        if have prettier; then
            prettier --write "$FILE" > /dev/null 2>&1 || true
        elif have npx; then
            npx --no-install prettier --write "$FILE" > /dev/null 2>&1 || true
        fi
        ;;
    *.go)
        if have goimports; then
            goimports -w "$FILE" > /dev/null 2>&1 || true
        elif have gofmt; then
            gofmt -w "$FILE" > /dev/null 2>&1 || true
        fi
        ;;
    *.py)
        if have ruff; then
            ruff format "$FILE" > /dev/null 2>&1 || true
            ruff check --fix "$FILE" > /dev/null 2>&1 || true
        elif have black; then
            black "$FILE" > /dev/null 2>&1 || true
        fi
        ;;
    *.rs)
        have rustfmt && rustfmt "$FILE" > /dev/null 2>&1 || true
        ;;
    *.sh | *.bash)
        have shfmt && shfmt -w "$FILE" > /dev/null 2>&1 || true
        ;;
    *.c | *.h | *.cc | *.cpp | *.hpp | *.cxx)
        have clang-format && clang-format -i "$FILE" > /dev/null 2>&1 || true
        ;;
    *.rb)
        have rubocop && rubocop -A "$FILE" > /dev/null 2>&1 || true
        ;;
esac

# ========================================
# Phase 2: Quick post-edit check (optional, silent)
# ========================================
# Runs a lightweight lint/typecheck on just the changed file.
# Only triggers when the relevant tool is installed AND a project config exists.
# All failures are swallowed — this is advisory, never blocking.

# TypeScript: quick typecheck if tsconfig exists nearby
case "$FILE" in
    *.ts | *.tsx)
        # Find tsconfig.json in file's dir or project root
        TSCONFIG=""
        DIR=$(dirname "$FILE")
        if [[ -f "$DIR/tsconfig.json" ]]; then
            TSCONFIG="$DIR/tsconfig.json"
        elif [[ -f "tsconfig.json" ]]; then
            TSCONFIG="tsconfig.json"
        fi
        if [[ -n "$TSCONFIG" ]] && have npx; then
            npx --no-install tsc --noEmit --project "$TSCONFIG" > /dev/null 2>&1 || true
        fi
        ;;
esac

# Python: quick ruff lint-only check (no fix)
case "$FILE" in
    *.py)
        if have ruff; then
            ruff check "$FILE" > /dev/null 2>&1 || true
        fi
        ;;
esac

# Go: quick vet on the changed file's package
case "$FILE" in
    *.go)
        if have go; then
            DIR=$(dirname "$FILE")
            go vet "$DIR" > /dev/null 2>&1 || true
        fi
        ;;
esac

# Shell: quick shellcheck if available
case "$FILE" in
    *.sh | *.bash)
        if have shellcheck; then
            shellcheck "$FILE" > /dev/null 2>&1 || true
        fi
        ;;
esac

exit 0
