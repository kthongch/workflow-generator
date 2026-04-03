---
name: Validation rules
description: BLOCKERS and WARNINGS checked before Gate 2
---

# Validation rules

## BLOCKERS — must pass (trigger fix loop if fail)

- Valid YAML (no syntax errors)
- Top-level: `name`, `on`, `jobs` present
- Every job has: `runs-on`, `steps`, `timeout-minutes`
- Every step has: `name`
- Every `run:` has: `shell:`
- `needs:` references exist as actual job ids
- No circular `needs:` chain
- `cleanup` job has `if: always()`
- `workflow_dispatch` inputs have `description`, `type`, `required`
- `type: choice` inputs have non-empty `options`
- Env var names are SCREAMING_SNAKE_CASE
- No plaintext secrets in `env:` values

## WARNINGS — shown at Gate 2 (don't block)

- `timeout-minutes` > 60 → warn
- Runner label contains "UNKNOWN" → warn
- No `cleanup` job → warn
- `workflow_dispatch` input `required: false` with no `default` → warn

## Fix loop behavior

On BLOCKER fail: send Claude the failing YAML + specific error + "Fix ONLY the reported issue." Max 3 retries. If still failing → trigger skill self-improve.
