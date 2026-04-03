---
name: Azure DevOps
description: Output platform — Azure DevOps pipeline YAML conventions
---

# Azure DevOps — output platform

## File location
`azure-pipelines.yml` at repo root, or `.azuredevops/deploy-<name>.yml`

## Structure
```yaml
trigger: none  # manual only for deployment pipelines

parameters:
  - name: updateType
    displayName: Update type
    type: string
    default: Minor
    values: [Major, Minor, Patch]

variables:
  deployDir: D:\Apps\Service
  archivePath: D:\Apps\Backup

stages:
  - stage: Prepare
    displayName: Prepare — all targets
    jobs:
      - job: PrepareJob
        pool:
          name: RUNNER-ALL
        timeoutInMinutes: 15
        steps:
          - powershell: |
              Remove-Item "$env:deployDir\*" -Force
            displayName: Clean work folder

  - stage: DeployWave1
    displayName: Deploy wave 1 — PROD-1
    dependsOn: Prepare
    jobs:
      - deployment: DeployWave1Job
        pool:
          name: RUNNER-PROD-1
        timeoutInMinutes: 30
        environment: production
        strategy:
          runOnce:
            deploy:
              steps:
                - powershell: |
                    Start-Process iisreset -ArgumentList '/STOP' -Wait
                  displayName: Stop IIS (Major only)
                  condition: eq('${{ parameters.updateType }}', 'Major')

  - stage: Cleanup
    displayName: Post-deploy cleanup
    dependsOn:
      - DeployWave1
    condition: always()
    jobs:
      - job: CleanupJob
        pool:
          name: RUNNER-ALL
        timeoutInMinutes: 10
        steps:
          - powershell: |
              Remove-Item "$env:workDir\*" -Force -ErrorAction SilentlyContinue
            displayName: Clean work folder
```

## Rules
- `dependsOn: [StageA, StageB]` = job dependency
- `condition: always()` = cleanup equivalent — must be on cleanup stage
- `condition: eq('${{ parameters.x }}', 'Value')` = conditional step
- `pool.name` = self-hosted runner pool name
- `environment:` = deployment environment (enables approval gates in UI)
- `parameters` = manual inputs (shown in UI when triggering)
- `variables` = env vars — SCREAMING_SNAKE_CASE not required but recommended
- Secrets: variable groups or `$(secretVar)` linked to Azure Key Vault
- PowerShell: use `powershell:` task, not `script:` for Windows runners
- `timeoutInMinutes` on every job — no exceptions
- `displayName` on every step — sentence case
