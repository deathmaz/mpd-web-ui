import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import { MpdError, MpdConnectionError, MpdArgumentError } from '@mpd-web/mpd-client'
import { errorHandler } from '../error-handler.js'

async function build() {
  const app = Fastify({ logger: false })
  app.setErrorHandler(errorHandler)
  app.get('/ack', async () => {
    throw new MpdError('No such song', 50, 0, 'playid')
  })
  app.get('/down', async () => {
    throw new MpdConnectionError('Not connected')
  })
  app.get('/dropped', async () => {
    throw new MpdConnectionError('Connection closed')
  })
  app.get('/badarg', async () => {
    throw new MpdArgumentError('MPD argument must not contain line breaks')
  })
  app.get('/boom', async () => {
    throw new Error('something internal')
  })
  await app.ready()
  return app
}

describe('errorHandler', () => {
  it('maps MPD ACK errors to 400 with code and command', async () => {
    const app = await build()
    const res = await app.inject({ url: '/ack' })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'No such song', code: 50, command: 'playid' })
    await app.close()
  })

  it('maps a missing or dropped MPD connection to 503', async () => {
    const app = await build()
    for (const url of ['/down', '/dropped']) {
      const res = await app.inject({ url })
      expect(res.statusCode).toBe(503)
      expect(res.json()).toEqual({ error: 'MPD not connected' })
    }
    await app.close()
  })

  it('maps rejected arguments (quote, search type) to 400 with the message', async () => {
    const app = await build()
    const res = await app.inject({ url: '/badarg' })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'MPD argument must not contain line breaks' })
    await app.close()
  })

  it('hides internal error details behind a 500', async () => {
    const app = await build()
    const res = await app.inject({ url: '/boom' })
    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({ error: 'Internal Server Error' })
    await app.close()
  })

  it('keeps the status of Fastify errors such as 404', async () => {
    const app = await build()
    const res = await app.inject({ url: '/nope' })
    expect(res.statusCode).toBe(404)
    await app.close()
  })
})
