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
- Existing test suites: `packages/mpd-client/src/__tests__/`, `apps/client/src/utils/__tests__/`, `apps/client/src/snapcast/__tests__/`

## Architecture notes

- Server maintains two persistent TCP connections to MPD: command (serialized queue) and idle (event loop)
- The idle connection runs a permanent `idle` loop — this command blocks indefinitely by design, no timeout
- All other MPD commands have a 10s timeout to prevent queue deadlock
- WebSocket broadcasts MPD subsystem events to all connected browser clients in real-time
- `/api/stream` proxies MPD's httpd output for browser audio playback
- Client elapsed time is interpolated locally (250ms interval) between server status updates
- Server serves the built client SPA with fallback to `index.html` for client-side routing
- In dev mode (`NODE_ENV=development`), static file serving is skipped — use Vite's dev server for HMR

### Virtual scrolling

- All large list views use `useVirtualList` composable (`apps/client/src/composables/useVirtualList.ts`) — renders only visible items
- Uses prefix-sum array for O(1) offset lookup, binary search for visible window, overscan buffer (5 items)
- Applied to: QueueView (mixed headers + songs), LibraryView (artists/albums/folders tabs), SearchView, PlaylistDetailView
- QueueView has sticky album headers via a computed that binary-searches `prefixSums` for the nearest header above viewport
- Row heights must be fixed per item type — set via inline styles, not CSS padding
- **All new list views with potentially large datasets must use `useVirtualList`** to avoid main thread blocking
- Test suites: `apps/client/src/composables/__tests__/`

### Snapcast integration

- Browser connects **directly** to snapserver via two WebSockets (`/stream` for binary audio, `/jsonrpc` for control) — no backend proxy needed
- Snapcast binary protocol implemented in `apps/client/src/snapcast/` — message parsing, time sync, FLAC/PCM decoding, Web Audio API playback
- FLAC decoding uses `libflacjs` (same library as Snapweb) — synchronous streaming decoder with callbacks, loaded as a static script from `public/libflac.js`
- Audio playback uses triple-buffered `AudioContext` scheduling (80ms buffers, 3 in flight) for gapless playback
- MPD stream and Snapcast are mutually exclusive audio sources, enforced by `useAudioSource` composable
- Snapcast server URL persisted in localStorage
- Test suites: `apps/client/src/snapcast/__tests__/`

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
