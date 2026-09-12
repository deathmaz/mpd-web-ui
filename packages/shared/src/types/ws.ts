import type { MpdStatus, MpdSong, MpdOutput } from './mpd.js'

// Server -> Client messages
export interface StateUpdate {
  type: 'state'
  status: MpdStatus
  currentSong: MpdSong | null
  queue: MpdSong[]
  outputs: MpdOutput[]
}

export interface PlayerUpdate {
  type: 'player'
  status: MpdStatus
  currentSong: MpdSong | null
}

export interface MixerUpdate {
  type: 'mixer'
  volume: number
}

export interface QueueUpdate {
  type: 'queue'
  queue: MpdSong[]
}

export interface OptionsUpdate {
  type: 'options'
  repeat: boolean
  random: boolean
  single: boolean | 'oneshot'
  consume: boolean | 'oneshot'
}

export interface OutputsUpdate {
  type: 'outputs'
  outputs: MpdOutput[]
}

export interface ServerError {
  type: 'error'
  message: string
}

export interface CommandResponse {
  type: 'response'
  id: string
  ok: boolean
  error?: string
  data?: unknown
}

// Application-level keepalive. Browsers never surface WS ping/pong control
// frames to JavaScript, so the server also sends this JSON message every 30s
// to keep the client-side heartbeat alive while MPD is idle.
export interface ServerPing {
  type: 'ping'
}

// Whether the server currently has a live connection to MPD. Sent on WS
// connect, and broadcast whenever the MPD connection drops or comes back.
export interface MpdConnectionUpdate {
  type: 'mpd'
  connected: boolean
}

export type ServerMessage =
  | StateUpdate
  | PlayerUpdate
  | MixerUpdate
  | QueueUpdate
  | OptionsUpdate
  | OutputsUpdate
  | ServerError
  | CommandResponse
  | ServerPing
  | MpdConnectionUpdate

// Client -> Server commands. Single source of truth for the command names,
// their arguments and their result type; the server handler table and the
// client's sendCommand() are both typed from it.
export interface CommandMap {
  play: { args: { pos?: number }; result: void }
  playId: { args: { id: number }; result: void }
  pause: { args: { state?: boolean }; result: void }
  stop: { args: NoArgs; result: void }
  next: { args: NoArgs; result: void }
  previous: { args: NoArgs; result: void }
  seekCur: { args: { time: number }; result: void }
  setVolume: { args: { volume: number }; result: void }
  setRepeat: { args: { state: boolean }; result: void }
  setRandom: { args: { state: boolean }; result: void }
  setSingle: { args: { state: boolean | 'oneshot' }; result: void }
  setConsume: { args: { state: boolean | 'oneshot' }; result: void }
  add: { args: { uri: string }; result: void }
  addMultiple: { args: { uris: string[] }; result: void }
  addId: { args: { uri: string; position?: number }; result: number }
  deleteId: { args: { id: number }; result: void }
  deleteMultipleIds: { args: { ids: number[] }; result: void }
  move: { args: { from: number; to: number }; result: void }
  clear: { args: NoArgs; result: void }
  shuffle: { args: NoArgs; result: void }
  loadPlaylist: { args: { name: string }; result: void }
  savePlaylist: { args: { name: string }; result: void }
  deletePlaylist: { args: { name: string }; result: void }
  enableOutput: { args: { id: number }; result: void }
  disableOutput: { args: { id: number }; result: void }
  toggleOutput: { args: { id: number }; result: void }
}

export type NoArgs = Record<string, never>
export type CommandName = keyof CommandMap
export type CommandArgs<K extends CommandName> = CommandMap[K]['args']
export type CommandResult<K extends CommandName> = CommandMap[K]['result']

export interface ClientCommand<K extends CommandName = CommandName> {
  id: string
  command: K
  args?: CommandArgs<K>
}
