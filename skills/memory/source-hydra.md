---
source: hydra
status: stable
created_by: human
created_at: 2026-01-01
seen_count: 47
stable_threshold: 10
success_count: 44
fail_count: 3
success_rate: 0.94
last_job: job-example
last_seen: 2026-04-01
detection_signals: json,activities,deploymentVariables,executeCondition,deploymentGroup
---

## Observations

- Always has "activities" array sorted by "sort" field
- executeCondition "S" = always, "C" = conditional with conditionStatement
- conditionStatement always starts with "$hydra.run.status.SUCCESS &&" (strip this prefix)
- deploymentVariables with manual:true become workflow_dispatch inputs
- Variable names with leading digits need spelling out (7z → SEVEN_Z)
- START/END activities (sort 1 and last) are always dropped
- Hydra boilerplate: $checkRunning, $doneFile, deployLog.txt — always remove
- $hydra.variables['x'] → $env:X in PowerShell steps
