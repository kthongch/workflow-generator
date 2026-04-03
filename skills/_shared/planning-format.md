---
name: Planning format
description: Step 2 plan JSON structure shown at Gate 1
---

# Planning format

Respond ONLY with valid JSON — no markdown fences.

```json
{
  "sourceType": "hydra|azure|document|prompt",
  "sourceSummary": "One sentence",
  "detectedPatterns": ["wave-based deployment", "conditional on UpdateType"],
  "targetPlatform": "github-actions|azure-devops|jenkins|gitlab-ci",
  "expectedOutput": {
    "workflowFiles": ["deploy-app.yml"],
    "jobs": ["prepare", "deploy-wave-1", "cleanup"],
    "manualInputs": ["update_type"],
    "runnerLabels": ["RUNNER-PROD-1"]
  },
  "assumptions": ["Treating groups as sequential waves"],
  "blockers": ["Runner label not confirmed"],
  "skillUsed": "hydra",
  "skillVersion": "latest",
  "costEstimate": {
    "inputTokens": 53878,
    "outputTokens": 2800,
    "estimatedUsd": 0.204
  }
}
```

Rules: `detectedPatterns` = specific patterns found. `runnerLabels` = exact or `"UNKNOWN — confirm"`. `blockers` = things requiring human action post-generation.
