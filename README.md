# Workflow Generator

AI-powered CI/CD workflow generator — drop any deployment file, get a workflow PR.

## Quick start

```bash
pnpm install
cp apps/agent/.env.example apps/agent/.env
# Edit: ANTHROPIC_API_KEY, SKILLS_PATH
# Edit: GHES_URL, GHES_BOT_TOKEN, TARGET_REPO

# Terminal 1 — agent
cd apps/agent && node --import tsx/esm src/server.ts

# Terminal 2 — frontend
cd apps/frontend && npx next dev
# http://localhost:3000
```

## Architecture

```
apps/frontend/        Next.js UI (port 3000)
apps/agent/           Fastify agent (port 4000)
packages/types/       Shared TypeScript types
packages/ghes-client/ Octokit wrapper — supports GitHub.com and GHES
skills/               Markdown skill files — volume-mounted, not in image
```

## Agent loop

```
Step 1  read-skills     Haiku  — load _core + sources + platform
Step 2  plan            static — cost estimate from file metadata (no Claude)
[GATE 1 — user approves cost]
Step 3  map-input       Haiku  — extract variables, runners, waves
Step 4  generate YAML   Sonnet — streaming output
Step 5  validate + fix  Sonnet — lint + AI fix loop (max 3×)
[GATE 2 — user approves diff]
Step 6  open PR         Octokit → GitHub.com or GHES
Step 7  AI self-eval    Haiku  — score 0-10, update pattern store
Step 8  learn           Sonnet — write draft skill if source unknown
```

## Skills (open-ended)

```
skills/
├── _core/              Universal deployment + CI/CD knowledge (every job)
├── _shared/            Output format, planning, validation, repo standards
├── sources/            What each INPUT tool looks like
│   ├── hydra.md        Hydra CD JSON export
│   ├── azure-devops.md Azure DevOps pipeline YAML
│   ├── document.md     Word/PDF/Markdown docs
│   └── prompt.md       Free-text description
├── platforms/          How each OUTPUT platform is written
│   ├── github-actions.md
│   ├── azure-devops.md
│   ├── jenkins.md
│   └── gitlab-ci.md
└── memory/             Cross-job learning — markdown + frontmatter
```

Edit any `.md` → save → takes effect on next job. No redeploy needed.

## GitHub.com vs GHES

Configure via `.env` only — no code changes needed:

```bash
# GitHub.com
GHES_URL=https://github.com
GHES_BOT_TOKEN=ghp_...   # GitHub PAT with repo write

# Self-hosted GHES
GHES_URL=https://your-ghes-host.company.com
GHES_BOT_TOKEN=ghp_...   # GHES PAT with repo write
```

## Auth

```bash
# Local dev — no auth
AUTH_ENABLED=false

# Production — Keycloak OIDC
AUTH_ENABLED=true
KEYCLOAK_ISSUER=https://your-keycloak/realms/your-realm
KEYCLOAK_CLIENT_ID=workflow-generator
KEYCLOAK_CLIENT_SECRET=...
```

## PM2 (Windows Server)

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

## Docker (optional)

```bash
docker-compose up
```

## Skill lifecycle

`draft` (agent-created) → `learning` (human-reviewed PR) → `stable` (seen N times, high success rate)
