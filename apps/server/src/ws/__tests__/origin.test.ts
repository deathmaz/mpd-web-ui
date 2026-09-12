import { describe, it, expect } from 'vitest'
import http from 'http'
import Fastify from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
import { isOriginAllowed } from '../origin.js'
import { websocketRoute } from '../route.js'

describe('isOriginAllowed', () => {
  const host = '100.88.1.2:3000'

  it('allows requests without an Origin header (non-browser clients)', () => {
    expect(isOriginAllowed(undefined, host, [])).toBe(true)
  })

  it('allows an Origin whose host matches the request Host', () => {
    expect(isOriginAllowed('http://100.88.1.2:3000', host, [])).toBe(true)
    expect(isOriginAllowed('http://LOCALHOST:5173', 'localhost:5173', [])).toBe(true)
  })

  it('rejects a different host, port or scheme-only tricks', () => {
    expect(isOriginAllowed('http://evil.example', host, [])).toBe(false)
    expect(isOriginAllowed('http://100.88.1.2:3001', host, [])).toBe(false)
    expect(isOriginAllowed('http://100.88.1.2', host, [])).toBe(false)
    expect(isOriginAllowed('null', host, [])).toBe(false)
    expect(isOriginAllowed('not a url', host, [])).toBe(false)
    expect(isOriginAllowed('http://100.88.1.2:3000', undefined, [])).toBe(false)
  })

  it('allows origins from the explicit allow-list, ignoring case and trailing slash', () => {
    const allowed = ['https://music.example.com']
    expect(isOriginAllowed('https://music.example.com', host, allowed)).toBe(true)
    expect(isOriginAllowed('https://Music.Example.com/', host, allowed)).toBe(true)
    expect(isOriginAllowed('https://other.example.com', host, allowed)).toBe(false)
  })
})

describe('websocketRoute upgrade', () => {
  async function build() {
    const app = Fastify({ logger: false })
    await app.register(fastifyWebsocket)
    await app.register(websocketRoute)
    await app.listen({ port: 0, host: '127.0.0.1' })
    const { port } = app.server.address() as { port: number }
    return { app, port }
  }

  function upgrade(port: number, origin?: string): Promise<{ status: number; upgraded: boolean }> {
    return new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port,
        path: '/ws',
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
          ...(origin ? { Origin: origin } : {}),
        },
      })
      req.on('upgrade', (res, socket) => {
        socket.destroy()
        resolve({ status: res.statusCode ?? 0, upgraded: true })
      })
      req.on('response', (res) => {
        res.resume()
        res.on('end', () => resolve({ status: res.statusCode ?? 0, upgraded: false }))
      })
      req.on('error', reject)
      req.end()
    })
  }

  it('completes the upgrade for same-host and header-less clients, 403s foreign origins', async () => {
    const { app, port } = await build()
    try {
      expect(await upgrade(port, `http://127.0.0.1:${port}`)).toEqual({ status: 101, upgraded: true })
      expect(await upgrade(port)).toEqual({ status: 101, upgraded: true })
      expect(await upgrade(port, 'http://evil.example')).toEqual({ status: 403, upgraded: false })
    } finally {
      await app.close()
    }
  })
})
