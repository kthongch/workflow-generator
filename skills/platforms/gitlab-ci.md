---
name: GitLab CI
description: Output platform — GitLab CI/CD pipeline (.gitlab-ci.yml)
---

# GitLab CI — output platform

## File location
`.gitlab-ci.yml` at repo root

## Structure
```yaml
stages:
  - prepare
  - deploy-wave-1
  - cleanup

variables:
  DEPLOY_DIR: D:\Apps\Service   # non-sensitive only

prepare:
  stage: prepare
  tags: [RUNNER-ALL]
  timeout: 15 minutes
  script:
    - Remove-Item "$env:DEPLOY_DIR\*" -Force
  rules:
    - when: manual
      allow_failure: false

deploy-wave-1:
  stage: deploy-wave-1
  tags: [RUNNER-PROD-1]
  timeout: 30 minutes
  needs: [prepare]
  script:
    - powershell -File deploy.ps1
  rules:
    - if: $UPDATE_TYPE == "Major"
      when: on_success

cleanup:
  stage: cleanup
  tags: [RUNNER-ALL]
  timeout: 10 minutes
  needs: [deploy-wave-1]
  when: always           # GitLab equivalent of if: always()
  script:
    - Remove-Item "$env:WORK_DIR\*" -Force -ErrorAction SilentlyContinue
```

## Rules
- `tags:` = runner labels (list)
- `when: always` = cleanup equivalent
- `rules: - if:` = conditional
- `needs:` = job dependency
- Secrets: CI/CD variables marked as masked — list in review notes
