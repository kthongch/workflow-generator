---
name: GitHub Actions
description: Output platform — GitHub Actions workflow YAML conventions and 2025 best practices
---

# GitHub Actions — output platform

## File location
`.github/workflows/deploy-<name-kebab>.yml`

## Required top-level structure

```yaml
name: Deploy <App Name>

# run-name shows in Actions tab — include actor and key input
run-name: "Deploy ${{ inputs.update_type }} by @${{ github.actor }}"

on:
  workflow_dispatch:
    inputs:
      update_type:
        description: Update type
        type: choice
        required: true
        options: [Major, Minor, Patch]

# Least-privilege — explicit at workflow level
permissions:
  contents: read

# Cancel in-progress — false for deployments (never cancel mid-deploy)
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: false

env:
  DEPLOY_DIR: D:\Apps\Service   # SCREAMING_SNAKE_CASE, non-sensitive only

jobs:
  prepare:
    name: Prepare — all targets
    runs-on: [self-hosted, RUNNER-ALL]
    timeout-minutes: 15          # ALWAYS set — default 6hr is too long
    permissions:
      contents: read
    steps:
      - name: Step name          # sentence case, describe action not tool
        # Source: sort#2 / System
        shell: pwsh              # ALWAYS explicit — never rely on default
        run: |
          $ErrorActionPreference = 'Stop'

  deploy-wave-1:
    name: Deploy wave 1 — PROD-1
    needs: prepare
    runs-on: [self-hosted, RUNNER-PROD-1]
    timeout-minutes: 30
    environment: production      # use environments for prod — enables required reviewers
    steps: [...]

  cleanup:
    name: Post-deploy cleanup
    needs: [deploy-wave-1]
    if: always()                 # ALWAYS on cleanup
    runs-on: [self-hosted, RUNNER-ALL]
    timeout-minutes: 10
    steps: [...]
```

## Naming rules

| Element | Convention | Example |
|---|---|---|
| Workflow file | `deploy-<name-kebab>.yml` | `deploy-checkout-service.yml` |
| Job id | `kebab-case` | `deploy-wave-1` |
| Job name | Sentence case + context | `Deploy wave 1 — PROD-1` |
| Step name | Sentence case, action not tool | `Stop IIS application pool` |
| Env vars | `SCREAMING_SNAKE_CASE` | `DEPLOY_DIR` |
| Inputs | `snake_case` | `update_type` |

## Runners

```yaml
runs-on: [self-hosted, RUNNER-LABEL]
```
- List form always — `self-hosted` first
- `SCREAMING-KEBAB-CASE` for labels
- Never `ubuntu-latest` or `windows-latest` for internal deployments
- Unknown label → use `RUNNER-PLACEHOLDER`, flag as blocker

## Timeout rules

- Every job **must** have `timeout-minutes` — no exceptions
- Default 6-hour timeout is dangerous
- Formula: `ceil(sum_of_step_seconds / 60) + 10` buffer
- Min: 10 minutes · Max: 120 minutes

## Permissions — least privilege

```yaml
permissions:
  contents: read          # workflow level default

jobs:
  open-pr:
    permissions:
      contents: write     # job level override only where needed
      pull-requests: write
```

## Concurrency

```yaml
# Deployment — never cancel in-progress
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: false

# CI/PR — cancel stale runs
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ startsWith(github.ref, 'refs/pull/') }}
```

## Conditions

```yaml
if: inputs.update_type == 'Major'
if: inputs.update_type == 'Major' || inputs.update_type == 'Minor'
if: always()          # cleanup
if: failure()         # on failure only
```

`$hydra.run.status.SUCCESS` → omit `if:` entirely (it is the default).

## Secrets and env vars

```yaml
env:
  DEPLOY_DIR: D:\Apps\Service   # non-sensitive → top-level env

steps:
  - run: Connect-Service -Token ${{ secrets.SERVICE_TOKEN }}
    shell: pwsh
```

List every secret in `reviewNotes.secretsNeeded`. Never inline credentials.

## Shell and PowerShell

```yaml
shell: pwsh    # PowerShell Core — Windows
shell: bash    # Linux
# Always explicit — never omit
```

```powershell
$ErrorActionPreference = 'Stop'   # always at top of multi-command scripts
$env:DEPLOY_DIR                   # from workflow env:
${{ inputs.update_type }}         # embed in yaml — not a pwsh var
```

## Reusable workflows

When source suggests shared template pattern:

```yaml
# Caller (app repo)
jobs:
  deploy:
    uses: org/shared-workflows/.github/workflows/deploy-iis.yml@main
    with:
      update_type: ${{ inputs.update_type }}
    secrets: inherit

# Callee (shared repo)
on:
  workflow_call:
    inputs:
      update_type:
        type: string
        required: true
```

## Step source comments

```yaml
- name: Stop IIS application pool
  # Source: sort#6 / System / conditionStatement (Major only)
  if: inputs.update_type == 'Major'
  shell: pwsh
  run: |
    Start-Process iisreset -ArgumentList '/STOP' -Wait
```

## Boilerplate to always remove

- `$checkRunning` / `$doneFile` state tracking
- `deployLog.txt` file logging
- `$hydra.variables['x']` → `$env:X`
- `$hydra.run.status.SUCCESS` prefix → remove
- Azure DevOps `$(variableName)` → `${{ env.VARIABLE_NAME }}`
- Jenkins `${params.x}` → `${{ inputs.x }}`

## Validation checklist

- [ ] `name` and `on` present
- [ ] `run-name` includes context
- [ ] `permissions` at workflow level
- [ ] `concurrency` configured
- [ ] Every job has `timeout-minutes`
- [ ] Every `run:` has `shell:`
- [ ] `cleanup` has `if: always()`
- [ ] No secrets in `env:`
- [ ] All `needs:` reference valid job ids
- [ ] Runners in `[self-hosted, LABEL]` form
