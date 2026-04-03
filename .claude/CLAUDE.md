# Workflow Generator

AI-powered CI/CD workflow generator. Drop a deployment file → get a GitHub Actions PR.

## Stack
- `apps/agent/` — Fastify + TypeScript, port 4000, ESM (`"type":"module"`)
- `apps/frontend/` — Next.js 14 App Router, port 3000
- `packages/types/` — shared types (copied into `apps/agent/src/lib/types.ts` to bypass workspace resolution)
- `packages/ghes-client/` — Octokit wrapper (copied into `apps/agent/src/lib/ghes-client.ts`)
- `skills/` — markdown knowledge files, volume-mounted, read at runtime

## Run

```bash
pnpm install

# Terminal 1
cd apps/agent
node --import tsx/esm src/server.ts

# Terminal 2
cd apps/frontend
npx next dev
```

## Key env vars
```
apps/agent/.env          ANTHROPIC_API_KEY, SKILLS_PATH, AUTH_ENABLED=false
apps/frontend/.env.local AGENT_URL=http://localhost:4000, NEXT_PUBLIC_AUTH_ENABLED=false
```

## Agent architecture

```
server.ts → runner.ts → steps/01..06 → gates/gate1,gate2
                      → skill-improve/ (learn, propose, auto-mature)
                      → db.ts (JSON job store + audit log)
                      → auth.ts (Keycloak JWT, bypass if AUTH_ENABLED=false)
```

Job flow: `read-skills → [GATE 1] → map-input → generate → validate+fix → [GATE 2] → open-pr → self-eval → learn`

## Skills system

`skills/` has nothing to do with Claude Code. It is read by the **agent process** at runtime to guide workflow generation.

```
skills/_core/      universal deployment concepts (loaded every job)
skills/_shared/    output format, validation rules, repo standards
skills/sources/    per-tool knowledge: hydra.md, azure-devops.md, document.md, prompt.md
skills/platforms/  output syntax: github-actions.md, jenkins.md, gitlab-ci.md, azure-devops.md
skills/memory/     pattern store — frontmatter tracks seen_count, success_rate per source
```

When editing skill files: preserve frontmatter format, no rebuild needed.

## Important conventions

- `JobStore` and `auditLog` come from `src/db.ts` — not `src/jobs/store.ts` (deleted)
- All GHES calls use `ghesBaseUrl()` helper — supports both GitHub.com and GHES
- `AUTH_ENABLED=false` bypasses Keycloak entirely — check `src/auth.ts`
- Frontend middleware at `src/middleware.ts` — uses `NEXT_PUBLIC_AUTH_ENABLED`
- SSE proxy at `api/jobs/[id]/stream/route.ts` needs `export const dynamic = "force-dynamic"`
- No Python/native deps — `better-sqlite3` was replaced with JSON file store

## File structure (agent src)

```
src/
├── server.ts           HTTP endpoints + auth preHandler
├── db.ts               JobStore (JSON) + auditLog
├── auth.ts             Keycloak JWT verify (jose)
├── claude.ts           Anthropic SDK wrapper (JSON + streaming)
├── jobs/
│   ├── runner.ts       8-step orchestration loop
│   ├── emitter.ts      SSE pub/sub + gate signals
├── steps/
│   ├── 01-read-skills  load _core + sources + platforms
│   ├── 02-plan         (imported but unused — Gate 1 uses buildStaticPlan)
│   ├── 03-05-*         mapInput + generateWorkflow + validateAndFix + fix loop
│   └── 06-open-pr      Octokit → GHES/GitHub.com
├── gates/gate1.ts      Gate 1+2 (gate2.ts re-exports from gate1)
├── skill-improve/
│   ├── index.ts        re-exports
│   ├── propose.ts      proposeNewSourceSkill + proposeSkillFix
│   ├── learn-from-input.ts  Claude writes draft skill from unknown input
│   ├── pattern-store.ts     read/write skills/memory/*.md
│   ├── self-eval.ts    Haiku rates output 0-10
│   └── auto-mature.ts  learning→stable promotion trigger
├── webhooks/ghes.ts    PR merged/closed → update memory
└── lib/
    ├── types.ts        copied from packages/types
    └── ghes-client.ts  copied from packages/ghes-client
```

## PM2 (Windows Server)

```bash
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

## Docker (optional)

```bash
docker-compose up
# skills/ mounted as :ro volume, data/ as named volume
```
