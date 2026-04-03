---
name: Azure DevOps
description: Azure DevOps pipeline YAML — contains trigger: or - task: patterns
detect_hints: yml,yaml,trigger,stages,task,pool,vmImage
---

# Azure DevOps — source knowledge

How to read an Azure DevOps pipeline YAML.

---

## Structure

```yaml
trigger:
  branches: { include: [main] }

parameters:
  - name: deployEnv
    type: string
    values: [staging, prod]

variables:
  appName: my-service

stages:
  - stage: Deploy
    jobs:
      - job: DeployJob
        pool: { name: MyPool }
        steps:
          - task: CopyFiles@2
          - script: echo hello
```

---

## Key mappings

| Azure | CI primitive |
|---|---|
| `parameters` | Manual inputs / `workflow_dispatch` |
| `variables` | `env:` block |
| `stages[].jobs[]` | CI jobs |
| `pool.name` | Runner label (`runs-on: [self-hosted, NAME]`) |
| `pool.vmImage` | Hosted runner (`runs-on: ubuntu-latest`) |
| `dependsOn` | `needs:` |
| `condition: succeeded()` | omit (default) |
| `condition: failed()` | `if: failure()` |
| `condition: always()` | `if: always()` |

## Common task translations

| Azure task | CI equivalent |
|---|---|
| `CopyFiles@2` | `run: cp` or `actions/upload-artifact` |
| `PublishBuildArtifacts` | `actions/upload-artifact` |
| `DownloadBuildArtifacts` | `actions/download-artifact` |
| `PowerShell@2` | `shell: pwsh` + `run:` |
| `Bash@3` | `shell: bash` + `run:` |
| `DotNetCoreCLI@2` | `run: dotnet <command>` |
| `AzureWebApp@1` | `azure/webapps-deploy@v3` |

## Variable substitution

| Azure | GitHub Actions |
|---|---|
| `$(Build.BuildId)` | `${{ github.run_number }}` |
| `$(Build.SourceBranchName)` | `${{ github.ref_name }}` |
| `$(System.DefaultWorkingDirectory)` | `${{ github.workspace }}` |
| `${{ parameters.x }}` | `${{ inputs.x }}` |
| `$(variableName)` | `${{ env.VARIABLE_NAME }}` |
