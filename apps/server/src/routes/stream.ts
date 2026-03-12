import type { FastifyInstance } from 'fastify'
import http from 'http'
import { config } from '../config.js'

export async function streamRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/stream', async (request, reply) => {
    const url = `http://${config.mpdHost}:${config.mpdStreamPort}/`

    return new Promise<void>((resolve, _reject) => {
      const upstream = http.get(url, (res) => {
        reply.header(
          'Content-Type',
          res.headers['content-type'] || 'application/octet-stream',
        )
        reply.header('Cache-Control', 'no-cache, no-store')
        reply.header('Connection', 'keep-alive')

        // Forward ICY headers if present
        for (const [key, value] of Object.entries(res.headers)) {
          if (key.startsWith('icy-') && value) {
            reply.header(key, value)
          }
        }

        reply.raw.on('close', () => {
          res.destroy()
        })

        reply.send(res)
        resolve()
      })

      upstream.on('error', (err) => {
        reply.status(502).send({ error: 'Stream unavailable', detail: err.message })
        resolve()
      })

      request.raw.on('close', () => {
        upstream.destroy()
      })
    })
  })
}
