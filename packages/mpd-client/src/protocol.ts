/**
 * MPD protocol parser. Handles line-based text responses and binary data.
 *
 * Response format:
 *   Key: Value\n  (repeated)
 *   OK\n
 *
 * Error format:
 *   ACK [error@command_listNum] {current_command} message_text\n
 *
 * Binary format (albumart, readpicture):
 *   size: N\n
 *   type: mime/type\n  (optional)
 *   binary: M\n
 *   <M bytes of data>
 *   \n
 *   OK\n
 */

export class MpdError extends Error {
  constructor(
    public readonly ack: string,
    public readonly errorCode: number,
    public readonly commandIndex: number,
    public readonly currentCommand: string,
  ) {
    super(ack)
    this.name = 'MpdError'
  }
}

const ACK_RE = /^ACK \[(\d+)@(\d+)\] \{([^}]*)\} (.+)$/

export function parseAck(line: string): MpdError | null {
  const match = ACK_RE.exec(line)
  if (!match) return null
  return new MpdError(match[4], parseInt(match[1]), parseInt(match[2]), match[3])
}

export function parseKeyValue(line: string): [string, string] | null {
  const idx = line.indexOf(': ')
  if (idx === -1) return null
  return [line.substring(0, idx), line.substring(idx + 2)]
}

/**
 * Parse a multi-line MPD response into key-value pairs.
 * Handles duplicate keys by returning an array of entries.
 */
export function parseResponse(data: string): Map<string, string> {
  const result = new Map<string, string>()
  for (const line of data.split('\n')) {
    if (line === 'OK' || line === '' || line.startsWith('OK MPD')) continue
    const kv = parseKeyValue(line)
    if (kv) {
      result.set(kv[0], kv[1])
    }
  }
  return result
}

/**
 * Parse a list response where items are delimited by a repeating key.
 * E.g., "file:" delimits songs, "Artist:" delimits artists.
 */
export function parseListResponse(
  data: string,
  delimiter: string,
): Map<string, string>[] {
  const items: Map<string, string>[] = []
  let current: Map<string, string> | null = null

  for (const line of data.split('\n')) {
    if (line === 'OK' || line === '' || line.startsWith('OK MPD')) continue
    const kv = parseKeyValue(line)
    if (!kv) continue

    if (kv[0] === delimiter) {
      if (current) items.push(current)
      current = new Map()
    }
    if (!current) current = new Map()
    current.set(kv[0], kv[1])
  }
  if (current) items.push(current)

  return items
}

/**
 * Parse a simple list of values for a single key.
 * E.g., list Artist -> ["Artist: Foo", "Artist: Bar"]
 */
export function parseValueList(data: string, key: string): string[] {
  const values: string[] = []
  for (const line of data.split('\n')) {
    if (line === 'OK' || line === '' || line.startsWith('OK MPD')) continue
    const kv = parseKeyValue(line)
    if (kv && kv[0] === key) {
      values.push(kv[1])
    }
  }
  return values
}
