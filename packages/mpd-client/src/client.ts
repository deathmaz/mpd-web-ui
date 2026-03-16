import { EventEmitter } from 'events'
import { MpdConnection } from './connection.js'
import {
  parseKeyValue,
  parseResponse,
  parseListResponse,
  parseValueList,
  MpdError,
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

  get connected(): boolean {
    return this._connected
  }

  constructor(options: MpdClientOptions) {
    super()
    this.options = options
    this.cmdConn = new MpdConnection()
    this.idleConn = new MpdConnection()
  }

  async connect(): Promise<void> {
    const { host, port, password } = this.options

    await Promise.all([
      this.cmdConn.connect(host, port, password),
      this.idleConn.connect(host, port, password),
    ])

    this._connected = true
    this.reconnectDelay = 1000

    // Use once() to prevent listener accumulation across reconnects
    this.cmdConn.once('close', () => this.handleDisconnect())
    this.idleConn.once('close', () => this.handleDisconnect())
    this.cmdConn.once('error', (err) => this.emit('error', err))
    this.idleConn.once('error', (err) => this.emit('error', err))

    this.startIdleLoop()
    this.emit('connect')
  }

  disconnect(): void {
    this.idleRunning = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.cmdConn.disconnect()
    this.idleConn.disconnect()
    this._connected = false
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
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      try {
        this.cmdConn.disconnect()
        this.idleConn.disconnect()
        this.cmdConn = new MpdConnection()
        this.idleConn = new MpdConnection()
        await this.connect()
        this.emit('reconnect')
      } catch (err) {
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000)
        this.emit('error', new Error(`Reconnect failed (retry in ${this.reconnectDelay / 1000}s): ${err instanceof Error ? err.message : err}`))
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
          this.emit('error', err)
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
    await this.cmdConn.sendCommand(`add "${uri}"`)
  }

  async addMultiple(uris: string[]): Promise<void> {
    if (uris.length === 0) return
    const commands = ['command_list_begin']
    for (const uri of uris) {
      commands.push(`add "${uri}"`)
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
        ? `addid "${uri}" ${position}`
        : `addid "${uri}"`
    const response = await this.cmdConn.sendCommand(cmd)
    const m = parseResponse(response)
    return parseInt(m.get('Id') || '0')
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
      ? `list Album AlbumArtist "${artist}"`
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
    const cmd = uri ? `lsinfo "${uri}"` : 'lsinfo'
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
    const escaped = query.replace(/"/g, '\\"')
    const response = await this.cmdConn.sendCommand(
      `search ${type} "${escaped}"`,
    )
    return parseListResponse(response, 'file').map(mapToSong)
  }

  private buildFindAlbumCommand(album: string, artist?: string): string {
    const escAlbum = album.replace(/"/g, '\\"')
    let cmd = `find Album "${escAlbum}"`
    if (artist) {
      const escArtist = artist.replace(/"/g, '\\"')
      cmd += ` AlbumArtist "${escArtist}"`
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
    if (albums.length === 0) return []

    const results: (string | null)[] = []
    for (let i = 0; i < albums.length; i += chunkSize) {
      const chunk = albums.slice(i, i + chunkSize)
      const commands = chunk.map(({ album, artist }) =>
        this.buildFindAlbumCommand(album, artist) + ' window 0:1',
      )
      const responses = await this.cmdConn.sendCommandList(commands)
      // sendCommandList returns N+1 entries (trailing empty after last list_OK);
      // slice to chunk.length to keep results aligned with commands
      for (const r of responses.slice(0, chunk.length)) {
        const m = r ? parseResponse(r) : null
        results.push(m?.get('file') || null)
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
      `albumart "${uri}" ${offset}`,
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
      `readpicture "${uri}" ${offset}`,
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
      `listplaylistinfo "${name}"`,
    )
    return parseListResponse(response, 'file').map(mapToSong)
  }

  async loadPlaylist(name: string): Promise<void> {
    await this.cmdConn.sendCommand(`load "${name}"`)
  }

  async savePlaylist(name: string): Promise<void> {
    await this.cmdConn.sendCommand(`save "${name}"`)
  }

  async deletePlaylist(name: string): Promise<void> {
    await this.cmdConn.sendCommand(`rm "${name}"`)
  }

  // ---- Database ----

  async update(uri?: string): Promise<number> {
    const cmd = uri ? `update "${uri}"` : 'update'
    const response = await this.cmdConn.sendCommand(cmd)
    const m = parseResponse(response)
    return parseInt(m.get('updating_db') || '0')
  }
}
