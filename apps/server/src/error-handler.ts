import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { MpdError } from '@mpd-web/mpd-client'

/**
 * Map failures from the MPD layer onto meaningful HTTP statuses instead of a
 * blanket 500: MPD rejected the command (ACK) is a bad request, MPD being
 * unreachable is 503. Fastify's own errors keep their status (404, 400 ...).
 */
export function errorHandler(
  err: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (err instanceof MpdError) {
    reply.status(400).send({
      error: err.message,
      code: err.errorCode,
      command: err.currentCommand,
    })
    return
  }

  if (err.message === 'Not connected') {
    reply.status(503).send({ error: 'MPD not connected' })
    return
  }

  const statusCode =
    'statusCode' in err && typeof err.statusCode === 'number' ? err.statusCode : 500
  if (statusCode >= 500) {
    request.log.error(err)
    reply.status(statusCode).send({ error: 'Internal Server Error' })
  } else {
    reply.status(statusCode).send({ error: err.message })
  }
}
