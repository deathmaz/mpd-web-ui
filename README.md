# mpd-web-ui

A web-based frontend for [MPD](https://www.musicpd.org/) (Music Player Daemon) with browser audio streaming. Control playback and listen to your music library from any device on your network.

## Features

- Playback control (play, pause, stop, skip, seek, volume)
- Queue management (add, remove, reorder, shuffle, clear)
- Library browsing by artist and album with album art
- Full-text search across your music library
- Stored playlist support
- Playback modes (repeat, random, single, consume)
- Audio output toggling
- Browser audio streaming via MPD's httpd output
- Real-time state sync across all connected clients via WebSocket
- Mobile-friendly dark UI

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) >= 9
- MPD running with:
  - TCP socket enabled (default port 6600)
  - httpd output enabled for browser streaming (default port 8000)

### MPD httpd output

To stream audio to the browser, enable an httpd output in your `mpd.conf`:

```
audio_output {
    type            "httpd"
    name            "HTTP Stream"
    encoder         "opus"
    port            "8000"
    bitrate         "128000"
    format          "48000:16:2"
    always_on       "yes"
}
```

## Setup

```sh
git clone <repo-url> mpd-web-ui
cd mpd-web-ui
pnpm install
```

## Development

```sh
# Start both server and client in dev mode
pnpm dev

# Or start them separately
pnpm dev:server   # Fastify backend on :3000
pnpm dev:client   # Vite dev server on :5173 (proxies /api and /ws to :3000)
```

## Production

```sh
pnpm build
pnpm start
```

The server serves the built client SPA and exposes everything on a single port (default 3000).

### Running as a systemd service

A service file example is provided. To start mpd-web-ui automatically with your system:

```sh
# Copy and edit the example service file
cp mpd-web-ui.service.example mpd-web-ui.service
# Edit WorkingDirectory and paths to match your setup
vim mpd-web-ui.service

# Link the service file (stays in the project directory)
systemctl --user link $(pwd)/mpd-web-ui.service
systemctl --user daemon-reload
systemctl --user enable --now mpd-web-ui

# Allow user services to start at boot without login
loginctl enable-linger $USER
```

## Configuration

Environment variables:

| Variable | Default | Description |
|---|---|---|
| `HOST` | `0.0.0.0` | Server bind address |
| `PORT` | `3000` | Server port |
| `MPD_HOST` | `localhost` | MPD server address |
| `MPD_PORT` | `6600` | MPD TCP port |
| `MPD_PASSWORD` | — | MPD password (if set) |
| `MPD_STREAM_PORT` | `8000` | MPD httpd stream port |
| `CLIENT_DIST_PATH` | `../client/dist` | Path to built client files |

## Project structure

```
mpd-web-ui/
├── packages/
│   ├── shared/          # Shared TypeScript types
│   └── mpd-client/      # MPD TCP protocol client library
├── apps/
│   ├── server/          # Fastify backend (REST + WebSocket + stream proxy)
│   └── client/          # Vue 3 SPA (Vite + Pinia + Tailwind CSS v4)
├── package.json
└── pnpm-workspace.yaml
```

## Architecture

```
Browser ──WebSocket──▶ Fastify ──TCP──▶ MPD (control)
Browser ──GET /api/stream──▶ Fastify ──HTTP──▶ MPD httpd (audio)
```

The server maintains two persistent TCP connections to MPD:
- **Command connection** — serialized command queue for playback control, library queries, album art
- **Idle connection** — permanent `idle` loop that receives subsystem change events and broadcasts them to all WebSocket clients in real time

The `/api/stream` endpoint proxies MPD's httpd output so only one port needs to be exposed on your network.

## License

MIT
