import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'
import { addClient, broadcast } from '../broadcaster.js'

function createMockWs(readyState = 1 /* OPEN */, bufferedAmount = 0) {
  const ws = new EventEmitter() as EventEmitter & {
    readyState: number
    OPEN: number
    bufferedAmount: number
    send: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
  }
  ws.readyState = readyState
  ws.OPEN = 1
  ws.bufferedAmount = bufferedAmount
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

    it('skips clients with high bufferedAmount', () => {
      const wsGood = createMockWs(1, 0)
      const wsSlow = createMockWs(1, 2 * 1024 * 1024) // 2MB buffered
      addClient(wsGood as any)
      addClient(wsSlow as any)

      broadcast({ type: 'mixer', volume: 50 } as any)

      expect(wsGood.send).toHaveBeenCalledOnce()
      expect(wsSlow.send).not.toHaveBeenCalled()

      cleanupClient(wsGood)
      cleanupClient(wsSlow)
    })

    it('disconnects clients after too many consecutive drops', () => {
      const wsSlow = createMockWs(1, 2 * 1024 * 1024)
      addClient(wsSlow as any)

      // Send 10 broadcasts — all dropped due to high bufferedAmount
      for (let i = 0; i < 10; i++) {
        broadcast({ type: 'mixer', volume: i } as any)
      }

      expect(wsSlow.send).not.toHaveBeenCalled()
      expect(wsSlow.close).toHaveBeenCalledWith(1008, 'Too slow')
    })

    it('resets drop counter on successful send', () => {
      const ws = createMockWs(1, 2 * 1024 * 1024)
      addClient(ws as any)

      // Drop 9 messages (one below threshold)
      for (let i = 0; i < 9; i++) {
        broadcast({ type: 'mixer', volume: i } as any)
      }
      expect(ws.send).not.toHaveBeenCalled()
      expect(ws.close).not.toHaveBeenCalled()

      // Buffer clears — next send succeeds, counter resets
      ws.bufferedAmount = 0
      broadcast({ type: 'mixer', volume: 99 } as any)
      expect(ws.send).toHaveBeenCalledOnce()

      // Another 9 drops should NOT trigger disconnect (counter was reset)
      ws.bufferedAmount = 2 * 1024 * 1024
      for (let i = 0; i < 9; i++) {
        broadcast({ type: 'mixer', volume: i } as any)
      }
      expect(ws.close).not.toHaveBeenCalled()

      cleanupClient(ws)
    })

    it('healthy clients are unaffected by one slow client', () => {
      const wsGood = createMockWs(1, 0)
      const wsSlow = createMockWs(1, 2 * 1024 * 1024)
      addClient(wsGood as any)
      addClient(wsSlow as any)

      for (let i = 0; i < 15; i++) {
        broadcast({ type: 'mixer', volume: i } as any)
      }

      // Good client received all 15
      expect(wsGood.send).toHaveBeenCalledTimes(15)
      // Slow client was disconnected after 10 drops
      expect(wsSlow.close).toHaveBeenCalledWith(1008, 'Too slow')

      cleanupClient(wsGood)
    })
  })
})
