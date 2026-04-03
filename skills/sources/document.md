---
name: Document
description: Word, PDF, Markdown, or plain text deployment instructions
detect_hints: docx,pdf,txt,md,deploy,instruction,procedure,runbook
---

# Document — source knowledge

How to extract deployment pipeline structure from written documentation.

---

## What to look for

Read the document and identify these regardless of format:

**Trigger signals** — "manually run", "on release", "every night at 2am", "when approved"

**Step signals** — numbered lists, bullet points, "then", "next", "after that", "run the following"

**Condition signals** — "only if", "when X is selected", "for major releases", "skip if..."

**Environment signals** — "deploy to staging first", "then prod", "servers: server1, server2"

**Script signals** — code blocks, `monospace text`, bat/ps1/sh file references

**Input signals** — "ask the operator for", "the user must provide", fill-in-the-blank

---

## Inference rules

When instructions are ambiguous, apply these defaults and flag as assumptions:

- Numbered steps in order → sequential CI steps
- "Deploy to X then Y" → wave-1 (X) → wave-2 (Y)
- "Run on server X" → runner label RUNNER-X (flag if not confirmed)
- "Backup first" → step before destructive action with archive command
- "Restart service" → service restart step after copy
- "Verify/smoke test" → add `verify` job after last wave
- No cleanup mentioned → add cleanup job anyway with `if: always()`
