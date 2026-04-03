---
name: Output format
description: JSON structure agent must return from generate step
---

# Output format

Return ONLY valid JSON — no markdown fences.

```json
{
  "files": [
    {
      "filename": "deploy-app.yml",
      "repoPath": ".github/workflows/deploy-app.yml",
      "content": "<full YAML string>",
      "mappingSummary": [
        { "source": "sort#6", "sourceType": "System", "condition": "Major only", "ghJob": "deploy-wave-1", "ghStep": "Stop IIS" }
      ],
      "reviewNotes": {
        "blockers": ["Confirm runner label RUNNER-PROD-1"],
        "assumptions": ["Treating deployment groups as waves"],
        "secretsNeeded": ["SERVICE_TOKEN — API auth credential"],
        "boilerplateRemoved": ["$checkRunning state tracking", "deployLog.txt logging"],
        "warnings": []
      }
    }
  ]
}
```
