FROM node:22-alpine
WORKDIR /app
RUN corepack enable pnpm

# Install deps (cached layer — only re-runs when lockfile changes)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/mpd-client/package.json packages/mpd-client/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN pnpm install --frozen-lockfile

# Copy source and build client SPA
COPY . .
RUN pnpm build

CMD ["pnpm", "start"]
