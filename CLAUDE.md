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
- MPD connection is self-healing: `startMpd()` uses `MpdClient.connectWithRetry()` (backoff 1s → 30s), so the server starts and stays up with MPD unreachable; `connect()` has a 5s greeting timeout; `MpdConnection`/`MpdClient` never emit `error` without a listener (an unhandled `error` event would crash the process)
- All other MPD commands have a 10s timeout to prevent queue deadlock
- **Never interpolate a string into an MPD command without `quote()`** (`packages/mpd-client/src/protocol.ts`): it escapes `\` and `"` and rejects line breaks, which would otherwise let a browser-supplied URI run a second command. Bare tokens (tag names like `search <type>`) must be validated against an identifier regex instead
- WebSocket upgrades are Origin-checked in `apps/server/src/ws/route.ts` / `origin.ts` (no Origin, same host as `Host`, or listed in `ALLOWED_ORIGINS`); anything else gets 403 before the upgrade. Guards against cross-site WebSocket hijacking, which Tailscale/LAN isolation does not cover
- WebSocket commands are typed end to end via `CommandMap` in `packages/shared/src/types/ws.ts` (name → args → result). Adding a command = add it there, add a handler in the `commands` table in `apps/server/src/ws/handler.ts` (args come from the wire as untrusted JSON, so pull them through the `int`/`str`/`bool` validators), then call `sendCommand('name', args)` on the client with full typing
- Fastify async route handlers that call `reply.send(stream)` must resolve/return the reply (`return reply.send(...)`); since fastify 5.12 resolving `undefined` after send responds with an empty body (regression test: `apps/server/src/routes/__tests__/stream.test.ts`)
- WebSocket broadcasts MPD subsystem events to all connected browser clients in real-time (`player`, `mixer` and `options` share one debounced `player` message carrying full `status` + `currentSong`; `playlist` → `queue`; `output` → `outputs`). Server also sends a JSON `{ type: 'ping' }` every 30s (browsers cannot see WS ping/pong control frames); the client reconnects after 45s of silence, and immediately on `visibilitychange`/`online` if the socket is closed or has been silent longer than that (background tabs throttle timers, so the heartbeat alone is too slow there). On WS connect the server first sends `{ type: 'mpd', connected }`; it broadcasts `mpd` on every MPD disconnect/reconnect and a fresh full `state` after reconnect so clients resync (Settings shows a three-state connection label)
- `/api/stream` proxies MPD's httpd output for browser audio playback
- Album art: `MpdClient.connect()` sends `binarylimit 1048576` so a cover is one round trip instead of 8 KiB chunks; `apps/server/src/services/art.ts` wraps MPD with a 50 MB positive LRU, a 1 h negative LRU (files with no art) and in-flight coalescing. `/api/art/*` sends `Cache-Control` on 404s too
- Library listings (`/api/library/artists|albums|genres`) are served from `apps/server/src/services/library-cache.ts`, which caches promises until MPD emits the `database` idle event (or disconnects); that event also clears the art caches. `browse`/`songs`/`search` hit MPD directly (cheap, path-specific)
- Server logging goes through `apps/server/src/logger.ts` (`log.info/warn/error`, printf `%s`), which is wired to Fastify's pino logger at startup — no `console.*` in `apps/server/src`. REST errors are mapped in `apps/server/src/error-handler.ts` by class, never by message string: `MpdError` (ACK) → 400 `{ error, code, command }`, `MpdConnectionError` (not connected / dropped / timed out) → 503, `MpdArgumentError` (`quote()`, bad search type) carries `statusCode: 400`, anything else 500 without details. Routes must not wrap MPD calls in their own catch-all
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
| `ALLOWED_ORIGINS` | — | Extra WebSocket origins (comma-separated, e.g. `https://music.example.com`). By default only pages served from the same host as the request may open the WebSocket |
