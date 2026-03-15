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
- Snapcast integration for synchronized multiroom audio playback
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
MPD_HOST=your-mpd-host pnpm dev
```

Open the **Vite dev server** URL shown in the terminal (default `http://localhost:5173/`). Vite proxies `/api` and `/ws` to the backend automatically and provides hot module replacement for instant client updates.

The backend only serves API and WebSocket endpoints in dev mode — client files are served by Vite.

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

### Running with Docker

No Node.js or pnpm needed on the host — only Docker:

```sh
git clone <repo-url> mpd-web-ui
cd mpd-web-ui

# Copy and edit the example compose file
cp docker-compose.example.yml docker-compose.yml
# Edit MPD_HOST, PORT, etc. to match your setup
docker compose up -d --build
```

The default config uses `network_mode: host` so the container can reach MPD on localhost.

**Rootless Docker**: `network_mode: host` is silently ignored. Set `MPD_HOST` to your machine's IP address (e.g. `192.168.1.50`), add `ports: ["3000:3000"]`, and remove `network_mode: host`. See the comments in `docker-compose.example.yml`.

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
│       └── src/snapcast/ # Snapcast client (binary protocol, FLAC decoder, Web Audio)
├── package.json
└── pnpm-workspace.yaml
```

## Architecture

```
Browser ──WebSocket──▶ Fastify ──TCP──▶ MPD (control)
Browser ──GET /api/stream──▶ Fastify ──HTTP──▶ MPD httpd (audio)
Browser ──WebSocket──▶ Snapserver (audio via Snapcast, optional)
```

The server maintains two persistent TCP connections to MPD:
- **Command connection** — serialized command queue for playback control, library queries, album art
- **Idle connection** — permanent `idle` loop that receives subsystem change events and broadcasts them to all WebSocket clients in real time

The `/api/stream` endpoint proxies MPD's httpd output so only one port needs to be exposed on your network.

### Snapcast integration

The UI can optionally act as a [Snapcast](https://github.com/snapcast/snapcast) client for synchronized multiroom audio. The browser connects directly to your snapserver — no backend proxy needed.

To use Snapcast:

1. Configure MPD with a FIFO output for Snapcast:
   ```
   audio_output {
       type            "fifo"
       name            "Snapcast"
       path            "/tmp/snapfifo"
       format          "48000:16:2"
       mixer_type      "software"
   }
   ```

2. Start snapserver with the FIFO as a source:
   ```sh
   snapserver -s pipe:///tmp/snapfifo?name=default
   ```

3. In the web UI, click the **Snapcast** button on the Now Playing page, enter your snapserver address (e.g. `192.168.1.50:1780`), and connect. The address is saved for future sessions.

The MPD stream ("Listen") and Snapcast are mutually exclusive — activating one stops the other. Snapcast volume and connection settings are also available in the Settings page.

## License

MIT
