---
name: Deployment concepts
description: Universal deployment knowledge — loaded every job
---

# Deployment concepts

Every pipeline regardless of tool has this structure:
`Trigger → Prepare → [Wave 1 → Wave 2 → ...] → Cleanup(always)`

## Universal concepts to extract from any source

| Concept | What it looks like |
|---|---|
| Trigger | Manual button, cron, inputs |
| Variables | Paths, URIs, config — non-sensitive |
| Steps | Scripts, file copies, service restarts |
| Conditions | Only on Major, only on environment X |
| Target groups | Sets of servers → one CI job per group |
| Runner/agent | Machine that executes → CI runner label |
| Secrets | Credentials → externalise, never inline |

## Mapping rules (source-agnostic)

- Every source action → one CI step. Name by action, not tool: "Stop IIS" not "Run iisreset"
- Conditions → `if:` expressions. Strip platform status prefixes (Hydra's `$hydra.run.status.SUCCESS` = default = omit `if:`)
- Non-sensitive variables → `env:` block, SCREAMING_SNAKE_CASE
- Sensitive values → `secrets:`, list in reviewNotes
- Manual inputs → `workflow_dispatch` inputs
- Target groups → jobs with `needs:` chain
- `cleanup` job → always `if: always()`
- Boilerplate to remove: state tracking files, verbose log headers, platform heartbeat calls

## Output quality rules
- Every job must have `timeout-minutes`
- Every `run:` step must declare `shell:`
- Add `# Source: <origin>` comment above each step
- Flag every inference as assumption, every gap as blocker
