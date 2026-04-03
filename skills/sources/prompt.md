---
name: Prompt / idea
description: Free-text description of a deployment process
detect_hints: prompt,idea,describe,create,build,no-file
---

# Prompt — source knowledge

How to generate a pipeline from a natural language description with no source file.

---

## Approach

1. Interpret generously — fill gaps with production-grade defaults
2. Ask clarifying questions in `assumptions` (do not block generation)
3. Generate a reasonable pipeline and flag everything inferred

## Defaults when not specified

| Missing info | Default |
|---|---|
| Trigger | `workflow_dispatch` with sensible inputs |
| Environment order | staging → manual gate → production |
| Runner | `[self-hosted, RUNNER-PLACEHOLDER]` — flag as blocker |
| Timeout | 30 minutes per job |
| Shell | pwsh if Windows signals present, bash otherwise |
| Cleanup | Always add with `if: always()` |

## Signal words to detect

**Technology** → infer shell and runner type
- IIS, Windows, .NET, PowerShell → pwsh, self-hosted Windows runner
- Linux, Node, Python, Docker → bash, linux runner

**Scale** → infer wave structure  
- "multiple servers", "each region" → wave pattern
- "blue-green", "canary" → parallel jobs with gate between them

**Approval** → infer environment gate
- "sign off", "approve", "manual", "notify" → `environment:` with required reviewers
