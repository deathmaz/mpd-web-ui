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

export type ServerMessage =
  | StateUpdate
  | PlayerUpdate
  | MixerUpdate
  | QueueUpdate
  | OptionsUpdate
  | OutputsUpdate
  | ServerError
  | CommandResponse

// Client -> Server messages
export interface ClientCommand {
  id: string
  command: string
  args?: Record<string, unknown>
}
