---
name: Hydra CD
description: Hydra deployment JSON export — contains "activities" array
detect_hints: json,activities,deploymentGroup,deploymentVariables,executeCondition
---

# Hydra CD — source knowledge

How to read a Hydra CD JSON export.

---

## JSON structure

```json
{
  "name": "Deployment name",
  "deploymentGroup": { "name": "group-name" },
  "deploymentVariables": [...],
  "activities": [...],
  "functions": [...]
}
```

---

## activities[]

Sorted by `sort` field — execution order.

```json
{
  "sort": 6,
  "description": "Stop IIS 1",
  "activityType": "System",
  "executeCondition": "C",
  "conditionStatement": "$hydra.run.status.SUCCESS && $hydra.variables['UpdateType'] == 'Major'",
  "executeLocation": "T"
}
```

| Field | Values | Meaning |
|---|---|---|
| `sort` | integer | execution order |
| `activityType` | `System`, `FileSystem` | inline script vs file copy |
| `executeCondition` | `S` = always, `C` = conditional | |
| `conditionStatement` | Hydra expression | translate to CI `if:` |
| `executeLocation` | `T` = target, `O` = orchestrator | |

**Drop**: `sort` where `name` is null and `activityType` is `System` with no script = START/END markers

---

## deploymentVariables[]

```json
{ "name": "UpdateType", "manual": true, "type": "list", "value": "Major:Major\nMinor:Minor" }
{ "name": "hydra_work", "manual": false, "type": "plain_text", "value": "D:\\Hydra\\work" }
```

| Condition | Maps to |
|---|---|
| `manual: true`, `type: list` | `workflow_dispatch` input `type: choice` — parse `"Label:Value\n"` |
| `manual: true`, `type: plain_text` | `workflow_dispatch` input `type: string` |
| `manual: false` | `env:` block, SCREAMING_SNAKE_CASE |

**Variable name rules:**
- Spaces → underscores
- Leading digit → spell out (`7z` → `SEVEN_Z`)
- `$hydra.variables['x']` in scripts → `$env:X`

---

## functions[] (target groups)

When `functions` is empty → single runner label from deployment context.
When present, each entry defines a target group → one CI job per group.

---

## Condition translation

Strip `$hydra.run.status.SUCCESS &&` — it is the default and maps to omitting `if:` entirely.

```
$hydra.run.status.SUCCESS && $hydra.variables['UpdateType'] == 'Major'
→ if: inputs.pas_update_type == 'Major'
```

---

## Boilerplate to remove

- `$checkRunning` / `$doneFile` state tracking
- `deployLog.txt` file logging
- `"Running $scriptName" | Out-File ...` headers
- `$hydra.run.status.SUCCESS` prefix
