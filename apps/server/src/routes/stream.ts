import type { FastifyInstance } from 'fastify'
import http from 'http'
import { config } from '../config.js'

export async function streamRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/stream', async (request, reply) => {
    const url = `http://${config.mpdHost}:${config.mpdStreamPort}/`

    // Resolve with the reply: since fastify 5.12 an async handler that resolves
    // `undefined` after reply.send(stream) overrides the stream with an empty body.
    return new Promise<typeof reply>((resolve, _reject) => {
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

        resolve(reply.send(res))
      })

      upstream.on('error', (err) => {
        resolve(
          reply.status(502).send({ error: 'Stream unavailable', detail: err.message }),
        )
      })

      request.raw.on('close', () => {
        upstream.destroy()
      })
    })
  })
}
