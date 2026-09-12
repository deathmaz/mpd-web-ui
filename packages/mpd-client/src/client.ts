import { EventEmitter } from 'events'
import { MpdConnection } from './connection.js'
import {
  parseKeyValue,
  parseResponse,
  parseListResponse,
  parseValueList,
  quote,
  MpdError,
  MpdArgumentError,
  MpdConnectionError,
} from './protocol.js'
import type {
  MpdStatus,
  MpdSong,
  MpdOutput,
  MpdPlaylist,
  MpdSubsystem,
  MpdDirectoryEntry,
} from '@mpd-web/shared'

function mapToSong(m: Map<string, string>): MpdSong {
  const song: MpdSong = { file: m.get('file') || '' }
  for (const [k, v] of m) {
    if (k === 'duration' || k === 'Time') {
      song[k] = parseFloat(v)
    } else if (k === 'Pos' || k === 'Id') {
      song[k] = parseInt(v)
    } else {
      song[k] = v
    }
  }
  return song
}

function mapToStatus(m: Map<string, string>): MpdStatus {
  const parseBoolOrOneshot = (v: string | undefined) => {
    if (v === 'oneshot') return 'oneshot' as const
    return v === '1'
  }
  return {
    volume: parseInt(m.get('volume') || '-1'),
    repeat: m.get('repeat') === '1',
    random: m.get('random') === '1',
    single: parseBoolOrOneshot(m.get('single')),
    consume: parseBoolOrOneshot(m.get('consume')),
    playlist: parseInt(m.get('playlist') || '0'),
    playlistlength: parseInt(m.get('playlistlength') || '0'),
    mixrampdb: parseFloat(m.get('mixrampdb') || '0'),
    state: (m.get('state') as MpdStatus['state']) || 'stop',
    song: m.has('song') ? parseInt(m.get('song')!) : undefined,
    songid: m.has('songid') ? parseInt(m.get('songid')!) : undefined,
    time: m.get('time'),
    elapsed: m.has('elapsed') ? parseFloat(m.get('elapsed')!) : undefined,
    duration: m.has('duration') ? parseFloat(m.get('duration')!) : undefined,
    bitrate: m.has('bitrate') ? parseInt(m.get('bitrate')!) : undefined,
    audio: m.get('audio'),
    nextsong: m.has('nextsong') ? parseInt(m.get('nextsong')!) : undefined,
    nextsongid: m.has('nextsongid')
      ? parseInt(m.get('nextsongid')!)
      : undefined,
    updating_db: m.has('updating_db')
      ? parseInt(m.get('updating_db')!)
      : undefined,
  }
}

function mapToOutput(m: Map<string, string>): MpdOutput {
  return {
    outputid: parseInt(m.get('outputid') || '0'),
    outputname: m.get('outputname') || '',
    outputenabled: m.get('outputenabled') === '1',
    plugin: m.get('plugin') || '',
  }
}

const BINARY_LIMIT = 1024 * 1024

export interface MpdClientOptions {
  host: string
  port: number
  password?: string
}

export class MpdClient extends EventEmitter {
  private cmdConn: MpdConnection
  private idleConn: MpdConnection
  private options: MpdClientOptions
  private idleRunning = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private _connected = false
  /** Set by disconnect(); stops any pending or future automatic reconnect. */
  private closed = false

  private readonly onConnClose = (): void => this.handleDisconnect()
  private readonly onConnError = (err: Error): void => this.safeEmitError(err)

  get connected(): boolean {
    return this._connected
  }

  constructor(options: MpdClientOptions) {
    super()
    this.options = options
    this.cmdConn = new MpdConnection()
    this.idleConn = new MpdConnection()
  }

  /**
   * Connect both connections. Rejects on failure and does NOT retry; use
   * connectWithRetry() for a long-lived client.
   */
  async connect(): Promise<void> {
    const { host, port, password } = this.options
    this.closed = false

    // Listen before connecting so a failure mid-handshake is observed here
    // and not as an unhandled 'error' event. off() first keeps this idempotent
    // if connect() is called twice on the same connection objects.
    for (const conn of [this.cmdConn, this.idleConn]) {
      conn.off('close', this.onConnClose)
      conn.off('error', this.onConnError)
      conn.on('close', this.onConnClose)
      conn.on('error', this.onConnError)
    }

    await Promise.all([
      this.cmdConn.connect(host, port, password),
      this.idleConn.connect(host, port, password),
    ])

    // MPD caps each albumart/readpicture response at 8 KiB by default, which
    // turns one cover into dozens of serialized round trips. Raise it to 1 MiB
    // (MPD >= 0.22.4); older servers ACK the unknown command, which is fine.
    await this.cmdConn.sendCommand(`binarylimit ${BINARY_LIMIT}`).catch(() => {})

    // A connection may have died during the handshake (its 'close' fired
    // while _connected was still false, so handleDisconnect ignored it).
    // Never report a half-connected client.
    if (!this.cmdConn.connected || !this.idleConn.connected) {
      this.cmdConn.disconnect()
      this.idleConn.disconnect()
      throw new MpdConnectionError('Connection lost during handshake')
    }

    this._connected = true
    this.reconnectDelay = 1000

    this.startIdleLoop()
    this.emit('connect')
  }

  /**
   * Connect and keep retrying with backoff until disconnect() is called.
   * Failures are reported through the 'error' event instead of a rejection.
   */
  connectWithRetry(): void {
    this.closed = false
    this.connect().catch((err) => {
      if (this.closed) return
      this.safeEmitError(
        new Error(
          `Connect failed (retry in ${this.reconnectDelay / 1000}s): ${err instanceof Error ? err.message : err}`,
        ),
      )
      this.scheduleReconnect()
    })
  }

  disconnect(): void {
    this.closed = true
    this.idleRunning = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.cmdConn.disconnect()
    this.idleConn.disconnect()
    this._connected = false
  }

  private safeEmitError(err: unknown): void {
    if (this.listenerCount('error') > 0) {
      this.emit('error', err)
    }
  }

  private handleDisconnect(): void {
    const wasConnected = this._connected
    this._connected = false
    this.idleRunning = false
    if (wasConnected) {
      this.emit('disconnect')
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.closed) return
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      if (this.closed) return
      try {
        this.cmdConn.disconnect()
        this.idleConn.disconnect()
        this.cmdConn = new MpdConnection()
        this.idleConn = new MpdConnection()
        await this.connect()
        this.emit('reconnect')
      } catch (err) {
        if (this.closed) return
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000)
        this.safeEmitError(new Error(`Reconnect failed (retry in ${this.reconnectDelay / 1000}s): ${err instanceof Error ? err.message : err}`))
        this.scheduleReconnect()
      }
    }, this.reconnectDelay)
  }

  private async startIdleLoop(): Promise<void> {
    this.idleRunning = true
    while (this.idleRunning && this.idleConn.connected) {
      try {
        const response = await this.idleConn.sendCommand('idle')
        if (!this.idleRunning) break

        const changed = parseValueList(response, 'changed')
        for (const subsystem of changed) {
          this.emit(subsystem as MpdSubsystem)
        }
      } catch (err) {
        if (this.idleRunning) {
          this.safeEmitError(err)
          // Trigger reconnect — idle loop dying means we can't receive events
          this.handleDisconnect()
          return
        }
      }
    }
  }

  // ---- Status & current song ----

  async status(): Promise<MpdStatus> {
    const response = await this.cmdConn.sendCommand('status')
    return mapToStatus(parseResponse(response))
  }

  async currentSong(): Promise<MpdSong | null> {
    const response = await this.cmdConn.sendCommand('currentsong')
    const m = parseResponse(response)
    if (m.size === 0) return null
    return mapToSong(m)
  }

  // ---- Playback control ----

  async play(pos?: number): Promise<void> {
    const cmd = pos !== undefined ? `play ${pos}` : 'play'
    await this.cmdConn.sendCommand(cmd)
  }

  async playId(id: number): Promise<void> {
    await this.cmdConn.sendCommand(`playid ${id}`)
  }

  async pause(state?: boolean): Promise<void> {
    if (state !== undefined) {
      await this.cmdConn.sendCommand(`pause ${state ? '1' : '0'}`)
    } else {
      await this.cmdConn.sendCommand('pause')
    }
  }

  async stop(): Promise<void> {
    await this.cmdConn.sendCommand('stop')
  }

  async next(): Promise<void> {
    await this.cmdConn.sendCommand('next')
  }

  async previous(): Promise<void> {
    await this.cmdConn.sendCommand('previous')
  }

  async seek(songpos: number, time: number): Promise<void> {
    await this.cmdConn.sendCommand(`seek ${songpos} ${time}`)
  }

  async seekCur(time: number): Promise<void> {
    await this.cmdConn.sendCommand(`seekcur ${time}`)
  }

  // ---- Playback options ----

  async setVolume(vol: number): Promise<void> {
    await this.cmdConn.sendCommand(`setvol ${Math.round(vol)}`)
  }

  async setRepeat(state: boolean): Promise<void> {
    await this.cmdConn.sendCommand(`repeat ${state ? '1' : '0'}`)
  }

  async setRandom(state: boolean): Promise<void> {
    await this.cmdConn.sendCommand(`random ${state ? '1' : '0'}`)
  }

  async setSingle(state: boolean | 'oneshot'): Promise<void> {
    const val = state === 'oneshot' ? 'oneshot' : state ? '1' : '0'
    await this.cmdConn.sendCommand(`single ${val}`)
  }

  async setConsume(state: boolean | 'oneshot'): Promise<void> {
    const val = state === 'oneshot' ? 'oneshot' : state ? '1' : '0'
    await this.cmdConn.sendCommand(`consume ${val}`)
  }

  // ---- Queue ----

  async playlistInfo(): Promise<MpdSong[]> {
    const response = await this.cmdConn.sendCommand('playlistinfo')
    return parseListResponse(response, 'file').map(mapToSong)
  }

  async add(uri: string): Promise<void> {
    await this.cmdConn.sendCommand(`add ${quote(uri)}`)
  }

  async addMultiple(uris: string[]): Promise<void> {
    if (uris.length === 0) return
    const commands = ['command_list_begin']
    for (const uri of uris) {
      commands.push(`add ${quote(uri)}`)
    }
    commands.push('command_list_end')
    await this.cmdConn.sendCommand(commands.join('\n'))
  }

  async commandListOk(commands: string[]): Promise<string[]> {
    return this.cmdConn.sendCommandList(commands)
  }

  async addId(uri: string, position?: number): Promise<number> {
    const cmd =
      position !== undefined
        ? `addid ${quote(uri)} ${position}`
        : `addid ${quote(uri)}`
    const response = await this.cmdConn.sendCommand(cmd)
    const m = parseResponse(response)
    return parseInt(m.get('Id') || '0')
  }

  async deleteMultipleIds(ids: number[]): Promise<void> {
    if (ids.length === 0) return
    const commands = ['command_list_begin']
    for (const id of ids) {
      commands.push(`deleteid ${id}`)
    }
    commands.push('command_list_end')
    await this.cmdConn.sendCommand(commands.join('\n'))
  }

  async deletePos(pos: number): Promise<void> {
    await this.cmdConn.sendCommand(`delete ${pos}`)
  }

  async deleteId(id: number): Promise<void> {
    await this.cmdConn.sendCommand(`deleteid ${id}`)
  }

  async move(from: number, to: number): Promise<void> {
    await this.cmdConn.sendCommand(`move ${from} ${to}`)
  }

  async clear(): Promise<void> {
    await this.cmdConn.sendCommand('clear')
  }

  async shuffle(): Promise<void> {
    await this.cmdConn.sendCommand('shuffle')
  }

  // ---- Library / Database ----

  async listArtists(): Promise<string[]> {
    const response = await this.cmdConn.sendCommand('list AlbumArtist')
    return parseValueList(response, 'AlbumArtist')
  }

  async listAlbums(artist?: string): Promise<{ album: string; artist: string }[]> {
    const cmd = artist
      ? `list Album AlbumArtist ${quote(artist)}`
      : 'list Album group AlbumArtist'
    const response = await this.cmdConn.sendCommand(cmd)
    if (artist) {
      return parseValueList(response, 'Album').map((a) => ({
        album: a,
        artist: artist,
      }))
    }
    const items = parseListResponse(response, 'AlbumArtist')
    const albums: { album: string; artist: string }[] = []
    for (const m of items) {
      const albumArtist = m.get('AlbumArtist') || ''
      const album = m.get('Album')
      if (album) {
        albums.push({ album, artist: albumArtist })
      }
    }
    return albums
  }

  async lsinfo(uri = ''): Promise<MpdDirectoryEntry[]> {
    const cmd = uri ? `lsinfo ${quote(uri)}` : 'lsinfo'
    const response = await this.cmdConn.sendCommand(cmd)
    const entries: MpdDirectoryEntry[] = []
    let current: Map<string, string> | null = null
    let currentType: 'directory' | 'file' | null = null

    for (const line of response.split('\n')) {
      if (line === '' || line === 'OK' || line.startsWith('OK MPD')) continue
      const kv = parseKeyValue(line)
      if (!kv) continue
      const [key, value] = kv

      if (key === 'directory' || key === 'file') {
        if (current && currentType) {
          entries.push(this.mapDirectoryEntry(current, currentType))
        }
        current = new Map()
        currentType = key
        current.set(key, value)
      } else if (key === 'playlist') {
        // Flush previous entry and skip playlist entries
        if (current && currentType) {
          entries.push(this.mapDirectoryEntry(current, currentType))
        }
        current = null
        currentType = null
      } else if (current) {
        current.set(key, value)
      }
    }
    if (current && currentType) {
      entries.push(this.mapDirectoryEntry(current, currentType))
    }
    return entries
  }

  private mapDirectoryEntry(
    m: Map<string, string>,
    type: 'directory' | 'file',
  ): MpdDirectoryEntry {
    const path = m.get(type) || ''
    const name = path.includes('/') ? path.substring(path.lastIndexOf('/') + 1) : path
    const entry: MpdDirectoryEntry = { type, path, name }
    if (type === 'file') {
      if (m.has('Title')) entry.Title = m.get('Title')
      if (m.has('Artist')) entry.Artist = m.get('Artist')
      if (m.has('Album')) entry.Album = m.get('Album')
      if (m.has('duration')) entry.duration = parseFloat(m.get('duration')!)
      if (m.has('Time')) entry.Time = parseInt(m.get('Time')!)
    }
    return entry
  }

  async listGenres(): Promise<string[]> {
    const response = await this.cmdConn.sendCommand('list Genre')
    return parseValueList(response, 'Genre')
  }

  async find(filter: string): Promise<MpdSong[]> {
    const response = await this.cmdConn.sendCommand(`find ${filter}`)
    return parseListResponse(response, 'file').map(mapToSong)
  }

  async search(query: string, type = 'any'): Promise<MpdSong[]> {
    // `type` is a bare (unquoted) tag name on the wire, so it cannot be
    // escaped; only accept identifiers.
    if (!/^[A-Za-z_]+$/.test(type)) {
      throw new MpdArgumentError(`Invalid search type: ${type}`)
    }
    const response = await this.cmdConn.sendCommand(
      `search ${type} ${quote(query)}`,
    )
    return parseListResponse(response, 'file').map(mapToSong)
  }

  private buildFindAlbumCommand(album: string, artist?: string): string {
    let cmd = `find Album ${quote(album)}`
    if (artist) {
      cmd += ` AlbumArtist ${quote(artist)}`
    }
    return cmd
  }

  async findAlbumSongs(album: string, artist?: string): Promise<MpdSong[]> {
    const response = await this.cmdConn.sendCommand(
      this.buildFindAlbumCommand(album, artist),
    )
    return parseListResponse(response, 'file').map(mapToSong)
  }

  async findAlbumCoverFilesBatch(
    albums: Array<{ album: string; artist?: string }>,
    chunkSize = 200,
  ): Promise<(string | null)[]> {
    const info = await this.findAlbumInfoBatch(albums, chunkSize)
    return info.map(i => i.coverFile)
  }

  async findAlbumInfoBatch(
    albums: Array<{ album: string; artist?: string }>,
    chunkSize = 200,
  ): Promise<{ coverFile: string | null; date: string | null }[]> {
    if (albums.length === 0) return []

    const results: { coverFile: string | null; date: string | null }[] = []
    for (let i = 0; i < albums.length; i += chunkSize) {
      const chunk = albums.slice(i, i + chunkSize)
      const commands = chunk.map(({ album, artist }) =>
        this.buildFindAlbumCommand(album, artist) + ' window 0:1',
      )
      const responses = await this.cmdConn.sendCommandList(commands)
      for (const r of responses.slice(0, chunk.length)) {
        const m = r ? parseResponse(r) : null
        results.push({
          coverFile: m?.get('file') || null,
          date: m?.get('Date') || null,
        })
      }
    }
    return results
  }

  // ---- Album Art ----

  async albumArt(
    uri: string,
    offset = 0,
  ): Promise<{ size: number; type?: string; data: Buffer }> {
    const result = await this.cmdConn.sendBinaryCommand(
      `albumart ${quote(uri)} ${offset}`,
    )
    return {
      size: parseInt(result.headers.get('size') || '0'),
      type: result.headers.get('type'),
      data: result.data,
    }
  }

  async readPicture(
    uri: string,
    offset = 0,
  ): Promise<{ size: number; type?: string; data: Buffer }> {
    const result = await this.cmdConn.sendBinaryCommand(
      `readpicture ${quote(uri)} ${offset}`,
    )
    return {
      size: parseInt(result.headers.get('size') || '0'),
      type: result.headers.get('type'),
      data: result.data,
    }
  }

  /**
   * Fetch complete album art, handling chunked transfers.
   * Tries readpicture first, falls back to albumart.
   */
  async getFullAlbumArt(
    uri: string,
  ): Promise<{ type: string; data: Buffer } | null> {
    for (const method of ['readpicture', 'albumart'] as const) {
      try {
        const fn = method === 'readpicture'
          ? this.readPicture.bind(this)
          : this.albumArt.bind(this)
        const first = await fn(uri, 0)
        if (first.size === 0) continue

        const chunks: Buffer[] = [first.data]
        let received = first.data.length
        const totalSize = first.size
        const contentType = first.type || 'image/jpeg'

        while (received < totalSize) {
          const chunk = await fn(uri, received)
          chunks.push(chunk.data)
          received += chunk.data.length
        }

        return { type: contentType, data: Buffer.concat(chunks, totalSize) }
      } catch (err) {
        if (err instanceof MpdError) continue
        throw err
      }
    }
    return null
  }

  // ---- Outputs ----

  async outputs(): Promise<MpdOutput[]> {
    const response = await this.cmdConn.sendCommand('outputs')
    return parseListResponse(response, 'outputid').map(mapToOutput)
  }

  async enableOutput(id: number): Promise<void> {
    await this.cmdConn.sendCommand(`enableoutput ${id}`)
  }

  async disableOutput(id: number): Promise<void> {
    await this.cmdConn.sendCommand(`disableoutput ${id}`)
  }

  async toggleOutput(id: number): Promise<void> {
    await this.cmdConn.sendCommand(`toggleoutput ${id}`)
  }

  // ---- Stored Playlists ----

  async listPlaylists(): Promise<MpdPlaylist[]> {
    const response = await this.cmdConn.sendCommand('listplaylists')
    return parseListResponse(response, 'playlist').map((m) => ({
      playlist: m.get('playlist') || '',
      'Last-Modified': m.get('Last-Modified') || '',
    }))
  }

  async listPlaylistInfo(name: string): Promise<MpdSong[]> {
    const response = await this.cmdConn.sendCommand(
      `listplaylistinfo ${quote(name)}`,
    )
    return parseListResponse(response, 'file').map(mapToSong)
  }

  async loadPlaylist(name: string): Promise<void> {
    await this.cmdConn.sendCommand(`load ${quote(name)}`)
  }

  async savePlaylist(name: string): Promise<void> {
    await this.cmdConn.sendCommand(`save ${quote(name)}`)
  }

  async deletePlaylist(name: string): Promise<void> {
    await this.cmdConn.sendCommand(`rm ${quote(name)}`)
  }

  // ---- Database ----

  async update(uri?: string): Promise<number> {
    const cmd = uri ? `update ${quote(uri)}` : 'update'
    const response = await this.cmdConn.sendCommand(cmd)
    const m = parseResponse(response)
    return parseInt(m.get('updating_db') || '0')
  }
}
