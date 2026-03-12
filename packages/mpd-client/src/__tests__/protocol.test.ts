import { describe, it, expect } from 'vitest'
import {
  MpdError,
  parseAck,
  parseKeyValue,
  parseResponse,
  parseListResponse,
  parseValueList,
} from '../protocol.js'

describe('MpdError', () => {
  it('stores ack details', () => {
    const err = new MpdError('No such song', 50, 0, 'play')
    expect(err.name).toBe('MpdError')
    expect(err.message).toBe('No such song')
    expect(err.errorCode).toBe(50)
    expect(err.commandIndex).toBe(0)
    expect(err.currentCommand).toBe('play')
    expect(err).toBeInstanceOf(Error)
  })
})

describe('parseAck', () => {
  it('parses a valid ACK line', () => {
    const err = parseAck('ACK [50@0] {play} No such song')
    expect(err).toBeInstanceOf(MpdError)
    expect(err!.errorCode).toBe(50)
    expect(err!.commandIndex).toBe(0)
    expect(err!.currentCommand).toBe('play')
    expect(err!.message).toBe('No such song')
  })

  it('parses ACK with empty command', () => {
    const err = parseAck('ACK [2@0] {} Bad request')
    expect(err).toBeInstanceOf(MpdError)
    expect(err!.currentCommand).toBe('')
    expect(err!.errorCode).toBe(2)
  })

  it('returns null for non-ACK lines', () => {
    expect(parseAck('OK')).toBeNull()
    expect(parseAck('file: foo.mp3')).toBeNull()
    expect(parseAck('')).toBeNull()
  })
})

describe('parseKeyValue', () => {
  it('parses a key-value line', () => {
    expect(parseKeyValue('file: music/song.flac')).toEqual([
      'file',
      'music/song.flac',
    ])
  })

  it('handles colons in the value', () => {
    expect(parseKeyValue('Title: 10:00 AM')).toEqual(['Title', '10:00 AM'])
  })

  it('handles empty value', () => {
    expect(parseKeyValue('Genre: ')).toEqual(['Genre', ''])
  })

  it('returns null for lines without ": "', () => {
    expect(parseKeyValue('OK')).toBeNull()
    expect(parseKeyValue('nocolon')).toBeNull()
    expect(parseKeyValue('')).toBeNull()
  })

  it('returns null when colon has no space after', () => {
    expect(parseKeyValue('key:value')).toBeNull()
  })
})

describe('parseResponse', () => {
  it('parses a multi-line response', () => {
    const data = 'volume: 80\nrepeat: 1\nrandom: 0\nOK\n'
    const result = parseResponse(data)
    expect(result.get('volume')).toBe('80')
    expect(result.get('repeat')).toBe('1')
    expect(result.get('random')).toBe('0')
    expect(result.size).toBe(3)
  })

  it('skips OK and OK MPD lines', () => {
    const data = 'OK MPD 0.23.5\nvolume: 50\nOK\n'
    const result = parseResponse(data)
    expect(result.size).toBe(1)
    expect(result.get('volume')).toBe('50')
  })

  it('handles empty response', () => {
    const result = parseResponse('OK\n')
    expect(result.size).toBe(0)
  })

  it('handles empty string', () => {
    const result = parseResponse('')
    expect(result.size).toBe(0)
  })

  it('overwrites duplicate keys with last value', () => {
    const data = 'Tag: first\nTag: second\nOK\n'
    const result = parseResponse(data)
    expect(result.get('Tag')).toBe('second')
  })
})

describe('parseListResponse', () => {
  it('parses a list of songs delimited by "file"', () => {
    const data = [
      'file: track1.flac',
      'Title: Track One',
      'Artist: Band A',
      'file: track2.flac',
      'Title: Track Two',
      'Artist: Band B',
      'OK',
    ].join('\n')

    const items = parseListResponse(data, 'file')
    expect(items).toHaveLength(2)
    expect(items[0].get('file')).toBe('track1.flac')
    expect(items[0].get('Title')).toBe('Track One')
    expect(items[0].get('Artist')).toBe('Band A')
    expect(items[1].get('file')).toBe('track2.flac')
    expect(items[1].get('Title')).toBe('Track Two')
  })

  it('handles single item', () => {
    const data = 'file: only.mp3\nTitle: Solo\nOK\n'
    const items = parseListResponse(data, 'file')
    expect(items).toHaveLength(1)
    expect(items[0].get('Title')).toBe('Solo')
  })

  it('handles empty response', () => {
    const items = parseListResponse('OK\n', 'file')
    expect(items).toHaveLength(0)
  })

  it('handles grouped response (albums grouped by artist)', () => {
    const data = [
      'AlbumArtist: Iron Maiden',
      'Album: Powerslave',
      'AlbumArtist: Iron Maiden',
      'Album: Somewhere in Time',
      'AlbumArtist: Metallica',
      'Album: Ride the Lightning',
      'OK',
    ].join('\n')

    const items = parseListResponse(data, 'AlbumArtist')
    expect(items).toHaveLength(3)
    expect(items[0].get('Album')).toBe('Powerslave')
    expect(items[2].get('AlbumArtist')).toBe('Metallica')
  })

  it('handles lines before first delimiter', () => {
    const data = 'Extra: orphan\nfile: song.mp3\nTitle: Test\nOK\n'
    const items = parseListResponse(data, 'file')
    // The orphan line gets its own item since current is lazily created
    expect(items).toHaveLength(2)
    expect(items[1].get('file')).toBe('song.mp3')
  })
})

describe('parseValueList', () => {
  it('extracts values for a given key', () => {
    const data = [
      'AlbumArtist: Iron Maiden',
      'AlbumArtist: Metallica',
      'AlbumArtist: Megadeth',
      'OK',
    ].join('\n')

    const values = parseValueList(data, 'AlbumArtist')
    expect(values).toEqual(['Iron Maiden', 'Metallica', 'Megadeth'])
  })

  it('ignores other keys', () => {
    const data = 'changed: player\nchanged: mixer\nOK\n'
    const values = parseValueList(data, 'changed')
    expect(values).toEqual(['player', 'mixer'])
  })

  it('returns empty array when key not found', () => {
    const data = 'foo: bar\nOK\n'
    const values = parseValueList(data, 'baz')
    expect(values).toEqual([])
  })

  it('returns empty array for empty response', () => {
    expect(parseValueList('OK\n', 'anything')).toEqual([])
  })
})
