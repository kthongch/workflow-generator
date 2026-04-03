---
name: Jenkins
description: Output platform — Jenkins declarative pipeline (Jenkinsfile)
---

# Jenkins — output platform

## File location
`Jenkinsfile` at repo root

## Structure
```groovy
pipeline {
  agent { label 'RUNNER-LABEL' }
  options { timeout(time: 30, unit: 'MINUTES') }
  parameters {
    choice(name: 'UPDATE_TYPE', choices: ['Major','Minor','Patch'], description: 'Update type')
  }
  environment {
    DEPLOY_DIR = 'D:\\Apps\\Service'
  }
  stages {
    stage('Prepare') {
      steps {
        powershell 'Remove-Item "$env:DEPLOY_DIR\\*" -Force'
      }
    }
    stage('Deploy Wave 1') {
      agent { label 'RUNNER-PROD-1' }
      when { expression { params.UPDATE_TYPE == 'Major' } }
      steps {
        powershell '''
          Stop-Service myService -Force
        '''
      }
    }
  }
  post {
    always {
      powershell 'Remove-Item "$env:WORK_DIR\\*" -Force -ErrorAction SilentlyContinue'
    }
  }
}
```

## Rules
- `post { always {} }` = cleanup equivalent
- `when { expression {} }` = conditional step
- `parameters {}` = manual inputs
- `environment {}` = env vars (non-sensitive)
- `credentials()` = secrets — list in review notes
- `powershell` block for Windows, `sh` for Linux
