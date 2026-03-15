import { describe, expect, it } from 'vitest'
import { normalizeWsUrl } from '../url'

describe('normalizeWsUrl', () => {
  it('adds ws:// prefix when missing', () => {
    expect(normalizeWsUrl('192.168.1.50:1780')).toBe('ws://192.168.1.50:1780')
  })

  it('adds default port when missing', () => {
    expect(normalizeWsUrl('192.168.1.50')).toBe('ws://192.168.1.50:1780')
  })

  it('adds both prefix and port', () => {
    expect(normalizeWsUrl('myhost')).toBe('ws://myhost:1780')
  })

  it('preserves ws:// prefix', () => {
    expect(normalizeWsUrl('ws://192.168.1.50:1780')).toBe('ws://192.168.1.50:1780')
  })

  it('preserves wss:// prefix', () => {
    expect(normalizeWsUrl('wss://secure.host:1788')).toBe('wss://secure.host:1788')
  })

  it('adds default port to ws:// URL without port', () => {
    expect(normalizeWsUrl('ws://192.168.1.50')).toBe('ws://192.168.1.50:1780')
  })

  it('preserves explicit port', () => {
    expect(normalizeWsUrl('192.168.1.50:9999')).toBe('ws://192.168.1.50:9999')
  })

  it('trims whitespace', () => {
    expect(normalizeWsUrl('  192.168.1.50  ')).toBe('ws://192.168.1.50:1780')
  })

  it('accepts custom default port', () => {
    expect(normalizeWsUrl('myhost', 8080)).toBe('ws://myhost:8080')
  })
})
