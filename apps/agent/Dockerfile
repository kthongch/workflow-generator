FROM node:20-alpine AS base
RUN npm install -g pnpm

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY apps/agent/package.json ./apps/agent/
COPY packages/types/package.json ./packages/types/
COPY packages/ghes-client/package.json ./packages/ghes-client/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/agent/node_modules ./apps/agent/node_modules
COPY . .
RUN pnpm --filter @wfg/agent build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/apps/agent/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/agent/package.json ./

# skills/ is intentionally NOT copied — mounted as volume at runtime
# docker run -v ./skills:/mnt/skills ...

EXPOSE 4000
CMD ["node", "dist/server.js"]
