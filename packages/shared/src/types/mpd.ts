export interface MpdStatus {
  volume: number
  repeat: boolean
  random: boolean
  single: boolean | 'oneshot'
  consume: boolean | 'oneshot'
  playlist: number // queue version
  playlistlength: number
  mixrampdb: number
  state: 'play' | 'pause' | 'stop'
  song?: number // current song position in queue
  songid?: number
  time?: string // "elapsed:total"
  elapsed?: number
  duration?: number
  bitrate?: number
  audio?: string // "sampleRate:bits:channels"
  nextsong?: number
  nextsongid?: number
  updating_db?: number
}

export interface MpdSong {
  file: string
  Title?: string
  Artist?: string
  Album?: string
  AlbumArtist?: string
  Date?: string
  Track?: string
  Disc?: string
  Genre?: string
  Composer?: string
  Performer?: string
  duration?: number
  Time?: number
  Pos?: number
  Id?: number
  // Additional tag fields
  [key: string]: string | number | undefined
}

export interface MpdDirectoryEntry {
  type: 'directory' | 'file'
  path: string
  name: string
  // Only for files
  Title?: string
  Artist?: string
  Album?: string
  duration?: number
  Time?: number
}

export interface MpdOutput {
  outputid: number
  outputname: string
  outputenabled: boolean
  plugin: string
  attribute?: string
}

export interface MpdPlaylist {
  playlist: string
  'Last-Modified': string
}

export type MpdSubsystem =
  | 'database'
  | 'update'
  | 'stored_playlist'
  | 'playlist'
  | 'player'
  | 'mixer'
  | 'output'
  | 'options'
  | 'partition'
  | 'sticker'
  | 'subscription'
  | 'message'
  | 'neighbor'
  | 'mount'
