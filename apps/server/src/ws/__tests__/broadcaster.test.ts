import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'
import { addClient, broadcast } from '../broadcaster.js'

function createMockWs(readyState = 1 /* OPEN */) {
  const ws = new EventEmitter() as EventEmitter & {
    readyState: number
    OPEN: number
    send: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
  }
  ws.readyState = readyState
  ws.OPEN = 1
  ws.send = vi.fn()
  ws.close = vi.fn()
  return ws
}

// The broadcaster uses a module-level Set, so we need to clean up between tests
// by adding clients and then emitting 'close' to remove them
function cleanupClient(ws: ReturnType<typeof createMockWs>) {
  ws.emit('close')
}

describe('broadcaster', () => {
  describe('addClient', () => {
    it('removes client on close event', () => {
      const ws = createMockWs()
      addClient(ws as any)

      broadcast({ type: 'mixer', volume: 50 } as any)
      expect(ws.send).toHaveBeenCalledOnce()

      ws.emit('close')

      ws.send.mockClear()
      broadcast({ type: 'mixer', volume: 60 } as any)
      expect(ws.send).not.toHaveBeenCalled()
    })
  })

  describe('broadcast', () => {
    it('sends to all OPEN clients', () => {
      const ws1 = createMockWs()
      const ws2 = createMockWs()
      addClient(ws1 as any)
      addClient(ws2 as any)

      broadcast({ type: 'mixer', volume: 80 } as any)

      expect(ws1.send).toHaveBeenCalledOnce()
      expect(ws2.send).toHaveBeenCalledOnce()
      const sent = JSON.parse(ws1.send.mock.calls[0][0])
      expect(sent.type).toBe('mixer')
      expect(sent.volume).toBe(80)

      cleanupClient(ws1)
      cleanupClient(ws2)
    })

    it('skips clients that are not OPEN', () => {
      const wsOpen = createMockWs(1)
      const wsClosed = createMockWs(3) // CLOSED
      addClient(wsOpen as any)
      addClient(wsClosed as any)

      broadcast({ type: 'mixer', volume: 50 } as any)

      expect(wsOpen.send).toHaveBeenCalledOnce()
      expect(wsClosed.send).not.toHaveBeenCalled()

      cleanupClient(wsOpen)
      cleanupClient(wsClosed)
    })

    it('removes clients that throw on send', () => {
      const wsGood = createMockWs()
      const wsBad = createMockWs()
      wsBad.send.mockImplementation(() => { throw new Error('write error') })

      addClient(wsGood as any)
      addClient(wsBad as any)

      // First broadcast: wsBad throws, gets removed
      broadcast({ type: 'mixer', volume: 50 } as any)
      expect(wsGood.send).toHaveBeenCalledOnce()
      expect(wsBad.close).toHaveBeenCalled()

      // Second broadcast: only wsGood remains
      wsGood.send.mockClear()
      broadcast({ type: 'mixer', volume: 60 } as any)
      expect(wsGood.send).toHaveBeenCalledOnce()

      cleanupClient(wsGood)
    })
  })
})
