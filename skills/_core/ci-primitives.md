---
name: CI/CD primitives
description: Universal CI concepts — jobs, steps, triggers, gates across all platforms
---

# CI/CD primitives

## Trigger → platform mapping

| Primitive | GitHub Actions | Azure DevOps | Jenkins | GitLab CI |
|---|---|---|---|---|
| Manual+inputs | `workflow_dispatch` | `parameters` | `input` | `when: manual` |
| Scheduled | `schedule` | `schedules` | cron | `rules:` |

## Job structure

| Primitive | GitHub Actions | Azure DevOps | Jenkins | GitLab CI |
|---|---|---|---|---|
| Job | `jobs.<id>` | `stages[].jobs[]` | `stage` | job in `stages[]` |
| Runner | `runs-on` | `pool.name` | `agent` | `tags` |
| Dependency | `needs` | `dependsOn` | stage order | `needs` |
| Condition | `if:` | `condition:` | `when` | `rules:` |
| Always-run | `if: always()` | `condition: always()` | `post { always {} }` | `when: always` |

## Variable/secret

| Primitive | GitHub Actions | Azure DevOps | Jenkins | GitLab CI |
|---|---|---|---|---|
| Env var | `env:` | `variables:` | `environment {}` | `variables:` |
| Secret | `${{ secrets.X }}` | `$(secretVar)` | `credentials()` | masked var |
| Runtime input | `${{ inputs.x }}` | `${{ parameters.x }}` | `${params.x}` | pipeline var |
