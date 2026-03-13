# CLAUDE.md

## Project overview

Web-based frontend for MPD (Music Player Daemon) with browser audio streaming. pnpm monorepo with four packages:

- `packages/shared` — TypeScript types shared between client and server
- `packages/mpd-client` — MPD TCP protocol client library (command + idle connections)
- `apps/server` — Fastify backend (REST API, WebSocket, stream proxy)
- `apps/client` — Vue 3 SPA (Vite, Pinia, Tailwind CSS v4)

## Commands

```sh
pnpm dev              # start both server and client in dev mode
pnpm build            # build all packages
pnpm start            # run production server (serves built client)
pnpm test             # vitest run
pnpm test:watch       # vitest watch mode
pnpm lint             # oxlint
pnpm typecheck        # typecheck all packages
```

## Tech stack

- **Client**: Vue 3 (Composition API, `<script setup>`), TypeScript, Pinia, Vue Router, Tailwind CSS v4, Vite
- **Server**: Fastify 5, @fastify/static, @fastify/websocket, tsx
- **MPD client**: Raw TCP sockets, custom protocol parser
- **Testing**: Vitest
- **Linting**: oxlint

## Code conventions

- Vue components use `<script setup lang="ts">` exclusively
- Props via `defineProps<{...}>()`, emits via `defineEmits<{...}>()`
- Client imports use `@/` path alias (maps to `apps/client/src/`)
- Monorepo imports use `@mpd-web/shared`, `@mpd-web/mpd-client`
- All packages use ES modules (`"type": "module"`)
- File naming: PascalCase for `.vue` files, camelCase for `.ts` files
- Pinia stores use composition API style (`defineStore('name', () => { ... })`)
- Tailwind utility-first styling with custom theme variables in `main.css`
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`

## Testing

- Always include tests for new or changed logic that is testable (protocol parsing, connection handling, utility functions, store actions)
- Test files go in `__tests__/` directories adjacent to source, named `*.test.ts`
- Existing test suites: `packages/mpd-client/src/__tests__/`, `apps/client/src/utils/__tests__/`

## Architecture notes

- Server maintains two persistent TCP connections to MPD: command (serialized queue) and idle (event loop)
- The idle connection runs a permanent `idle` loop — this command blocks indefinitely by design, no timeout
- All other MPD commands have a 10s timeout to prevent queue deadlock
- WebSocket broadcasts MPD subsystem events to all connected browser clients in real-time
- `/api/stream` proxies MPD's httpd output for browser audio playback
- Client elapsed time is interpolated locally (250ms interval) between server status updates
- Server serves the built client SPA with fallback to `index.html` for client-side routing

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `HOST` | `0.0.0.0` | Server bind address |
| `PORT` | `3000` | Server port |
| `MPD_HOST` | `localhost` | MPD server address |
| `MPD_PORT` | `6600` | MPD TCP port |
| `MPD_PASSWORD` | — | MPD password (if set) |
| `MPD_STREAM_PORT` | `8000` | MPD httpd stream port |
| `CLIENT_DIST_PATH` | `../client/dist` | Path to built client files |
