import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import http from 'http'
import type { AddressInfo } from 'net'
import Fastify from 'fastify'
import { streamRoutes } from '../stream.js'

// config is read at import time; expose a mutable port so the mocked config
// can point at the upstream server started in beforeAll
const upstream = vi.hoisted(() => ({ port: 0 }))

vi.mock('../../config.js', () => ({
  config: {
    mpdHost: '127.0.0.1',
    get mpdStreamPort() {
      return upstream.port
    },
  },
}))

const PAYLOAD = Buffer.from('OggS-fake-audio-bytes-'.repeat(50))

describe('GET /api/stream', () => {
  let server: http.Server

  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'audio/ogg',
        'icy-name': 'Test Stream',
      })
      // headers first, body later: like MPD httpd, the first audio bytes arrive
      // after the response headers, so the proxy must keep the stream piped
      res.flushHeaders()
      setTimeout(() => res.write(PAYLOAD.subarray(0, 100)), 20)
      setTimeout(() => res.end(PAYLOAD.subarray(100)), 40)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    upstream.port = (server.address() as AddressInfo).port
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('pipes the upstream body and forwards content-type and icy headers', async () => {
    // Regression: since fastify 5.12 an async handler that resolves `undefined`
    // after reply.send(stream) responds with an empty body (content-length: 0)
    // app.inject() does not reproduce the bug, so go through a real socket
    const app = Fastify()
    await app.register(streamRoutes)
    const address = await app.listen({ port: 0, host: '127.0.0.1' })

    const res = await new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>(
      (resolve, reject) => {
        http.get(`${address}/api/stream`, (r) => {
          const chunks: Buffer[] = []
          r.on('data', (c: Buffer) => chunks.push(c))
          r.on('end', () =>
            resolve({ status: r.statusCode ?? 0, headers: r.headers, body: Buffer.concat(chunks) }),
          )
          r.on('error', reject)
        }).on('error', reject)
      },
    )

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('audio/ogg')
    expect(res.headers['icy-name']).toBe('Test Stream')
    expect(res.headers['cache-control']).toBe('no-cache, no-store')
    expect(res.headers['content-length']).toBeUndefined()
    expect(res.body.length).toBe(PAYLOAD.length)
    expect(res.body.equals(PAYLOAD)).toBe(true)

    await app.close()
  })

  it('responds 502 when the upstream is unreachable', async () => {
    const savedPort = upstream.port
    // a port with nothing listening: take a fresh one and release it
    const probe = http.createServer()
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
    upstream.port = (probe.address() as AddressInfo).port
    await new Promise<void>((resolve) => probe.close(() => resolve()))

    const app = Fastify()
    await app.register(streamRoutes)

    const res = await app.inject({ method: 'GET', url: '/api/stream' })

    expect(res.statusCode).toBe(502)
    expect(res.json()).toMatchObject({ error: 'Stream unavailable' })

    await app.close()
    upstream.port = savedPort
  })
})
