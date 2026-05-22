type Mode = 'classic' | 'timed'
type RoomStatus = 'lobby' | 'question' | 'reveal' | 'ended'
type Side = 'left' | 'right'
type RankingFilter = 'all' | 'top500' | 'top2000' | 'middle' | 'deep'
type ExcludeKey = 'guochan' | 'movies' | 'ova' | 'pamen' | 'oumei' | 'short' | 'recap'
type MediaTagFilterKey =
  | 'mangaShort'
  | 'mangaMedium'
  | 'mangaFourPanel'
  | 'mangaCompleted'
  | 'mangaNovelAdapted'
  | 'lightNovelWeb'
  | 'lightNovelCompleted'
type MediaKind = 'anime' | 'manga' | 'lightNovel' | 'galgame'
type GalgameAudience = 'all' | 'allAges' | 'adult'

interface Env {
  ROOM_HUB: DurableObjectNamespace
  SEED_URL?: string
}

interface Settings {
  mediaKind: MediaKind
  minVotes: number
  scoreMin: number
  scoreMax: number
  yearMin: number
  yearMax: number
  ranking: RankingFilter
  galgameAudience: GalgameAudience
  excludes: Record<ExcludeKey, boolean>
  tagFilters: Record<MediaTagFilterKey, boolean>
}

interface Anime {
  id: number
  mediaKind: MediaKind
  name: string
  nameCn: string
  score: number
  votes: number
  rank: number | null
  date: string
  image: string
  tags: string[]
  platform: string
  adult?: boolean
}

interface Player {
  id: string
  ws: WebSocket
  nickname: string
  score: number
  total: number
  streak: number
  pair: RoundPair | null
  lastResult: unknown
}

interface RoundPair {
  left: Anime
  right: Anime
}

interface Room {
  code: string
  hostId: string
  status: RoomStatus
  mode: Mode
  settings: Settings
  classicRounds: number
  timedSeconds: number
  poolCount: number
  players: Map<string, Player>
  answers: Map<string, AnswerResult>
  round: number
  pair: RoundPair | null
  pool: Anime[]
  reveal: unknown
  startAt: number | null
  durationMs: number | null
  endsAt: number | null
  timer: ReturnType<typeof setTimeout> | null
  advanceTimer: ReturnType<typeof setTimeout> | null
}

interface AnswerResult {
  selectedSide: Side
  correct: boolean
  winningSide: Side
  diff: number
}

const maxPlayers = 8
const currentYear = new Date().getFullYear()
const mediaKinds: MediaKind[] = ['anime', 'manga', 'lightNovel', 'galgame']
const seedFiles: Record<MediaKind, string> = {
  anime: 'anime-seed.json',
  manga: 'manga-seed.json',
  lightNovel: 'light-novel-seed.json',
  galgame: 'galgame-seed.json',
}
const presetExcludeDefaults: ExcludeKey[] = ['guochan', 'movies', 'oumei', 'recap']
const tagFilterKeys: MediaTagFilterKey[] = [
  'mangaShort',
  'mangaMedium',
  'mangaFourPanel',
  'mangaCompleted',
  'mangaNovelAdapted',
  'lightNovelWeb',
  'lightNovelCompleted',
]
const excludeTerms: Record<ExcludeKey, string[]> = {
  guochan: ['国产', '国漫', '中国', '中国大陆', '大陆'],
  movies: ['剧场版', '劇場版', '剧场', '劇場', '映画'],
  ova: ['OVA', 'OAD'],
  pamen: ['泡面番', '泡面'],
  oumei: ['欧美', '美国', '英国', '法国', '加拿大', '欧洲'],
  short: ['短片', '短篇', 'Short'],
  recap: ['总集篇', '總集篇', '总集', '總集', 'Recap'],
}
const tagFilterTerms: Partial<Record<MediaTagFilterKey, string[]>> = {
  mangaShort: ['短篇'],
  mangaMedium: ['中篇'],
  mangaFourPanel: ['四格', '4格'],
  mangaNovelAdapted: ['小说改', '小說改', '轻小说改', '輕小說改'],
  lightNovelWeb: ['web', 'web小说', 'web小說', '小説家になろう'],
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/ws') && !url.pathname.startsWith('/websocket')) {
      return new Response('Not found', { status: 404 })
    }
    const id = env.ROOM_HUB.idFromName('global-room-hub')
    return env.ROOM_HUB.get(id).fetch(request)
  },
}

export class RoomHub {
  private state: DurableObjectState
  private env: Env
  private rooms = new Map<string, Room>()
  private clients = new Map<WebSocket, { roomCode: string; playerId: string }>()
  private allSubjects = new Map<MediaKind, Anime[]>()
  private seedPromise: Promise<Map<MediaKind, Anime[]>> | null = null

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
  }

  async fetch(request: Request) {
    const upgradeHeader = request.headers.get('upgrade')
    if (upgradeHeader?.toLowerCase() === 'websocket') {
      await this.loadSubjectSeeds(request)
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)
      server.accept()
      this.open(server)
      return new Response(null, { status: 101, webSocket: client })
    }

    await this.loadSubjectSeeds(request)
    return Response.json(
      {
        ok: true,
        rooms: this.rooms.size,
        endpoint: '/ws',
        storage: 'memory',
      },
      { status: 426, headers: { upgrade: 'websocket' } },
    )
  }

  private async loadSubjectSeeds(request: Request) {
    if (this.allSubjects.size === mediaKinds.length) return this.allSubjects
    const origin = new URL(request.url).origin
    this.seedPromise ??= Promise.all(
      mediaKinds.map(async (mediaKind) => {
        const animeSeedUrl = mediaKind === 'anime' ? this.env.SEED_URL : undefined
        const response = await fetch(animeSeedUrl || `${origin}/${seedFiles[mediaKind]}`)
        if (!response.ok) throw new Error(`Failed to load ${mediaKind} seed: HTTP ${response.status}`)
        const rows = (await response.json()) as Anime[]
        return [mediaKind, rows.map((row) => ({ ...row, mediaKind: row.mediaKind ?? mediaKind }))] as const
      }),
    ).then((entries) => {
      this.allSubjects = new Map(entries)
      return this.allSubjects
    })
    return this.seedPromise
  }

  private open(ws: WebSocket) {
    this.send(ws, { type: 'connected' })
    ws.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return
      this.handleMessage(ws, event.data)
    })
    ws.addEventListener('close', () => this.leave(ws))
    ws.addEventListener('error', () => this.leave(ws))
  }

  private handleMessage(ws: WebSocket, raw: string) {
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(raw) as Record<string, unknown>
    } catch {
      this.send(ws, { type: 'error', message: '消息格式不正确。' })
      return
    }
    const room = this.findRoomFor(ws)
    if (payload.type === 'createRoom') this.createRoom(ws, payload)
    else if (payload.type === 'joinRoom') this.joinRoom(ws, payload)
    else if (payload.type === 'updateSettings' && room && this.requireHost(ws, room)) {
      this.updateRoomSettings(room, payload)
      this.broadcastRoom(room)
    } else if (payload.type === 'startGame') this.startGame(ws)
    else if (payload.type === 'answer') this.answer(ws, payload)
    else if (payload.type === 'returnToLobby') this.returnToLobby(ws)
    else if (payload.type === 'updateNickname') this.updateNickname(ws, payload)
    else if (payload.type === 'leaveRoom') this.leave(ws)
  }

  private sanitizeMediaKind(value: unknown): MediaKind {
    return mediaKinds.includes(value as MediaKind) ? (value as MediaKind) : 'anime'
  }

  private createDefaultSettings(mediaKind: MediaKind = 'anime'): Settings {
    return {
      mediaKind,
      minVotes: mediaKind === 'anime' ? 100 : 50,
      scoreMin: 0,
      scoreMax: 10,
      yearMin: 1900,
      yearMax: currentYear,
      ranking: 'all',
      galgameAudience: 'all',
      excludes: {
        guochan: mediaKind === 'anime',
        movies: mediaKind === 'anime',
        ova: false,
        pamen: false,
        oumei: mediaKind === 'anime',
        short: false,
        recap: mediaKind === 'anime',
      },
      tagFilters: Object.fromEntries(tagFilterKeys.map((key) => [key, false])) as Record<MediaTagFilterKey, boolean>,
    }
  }

  private sanitizeSettings(settings = {} as Partial<Settings>): Settings {
    const mediaKind = this.sanitizeMediaKind(settings.mediaKind)
    const defaults = this.createDefaultSettings(mediaKind)
    const minVotes = Number.parseInt(String(settings.minVotes), 10)
    const scoreMin = Number.parseFloat(String(settings.scoreMin))
    const scoreMax = Number.parseFloat(String(settings.scoreMax))
    const yearMin = Number.parseInt(String(settings.yearMin), 10)
    const yearMax = Number.parseInt(String(settings.yearMax), 10)
    const next: Settings = {
      mediaKind,
      minVotes: Number.isFinite(minVotes)
        ? Math.max(defaults.minVotes, Math.min(5000, minVotes))
        : defaults.minVotes,
      scoreMin: Number.isFinite(scoreMin) ? Math.max(0, Math.min(10, scoreMin)) : defaults.scoreMin,
      scoreMax: Number.isFinite(scoreMax) ? Math.max(0, Math.min(10, scoreMax)) : defaults.scoreMax,
      yearMin: Number.isFinite(yearMin) ? Math.max(1900, Math.min(2030, yearMin)) : defaults.yearMin,
      yearMax: Number.isFinite(yearMax) ? Math.max(1900, Math.min(2030, yearMax)) : defaults.yearMax,
      ranking: ['all', 'top500', 'top2000', 'middle', 'deep'].includes(String(settings.ranking))
        ? (settings.ranking as RankingFilter)
        : defaults.ranking,
      galgameAudience: ['all', 'allAges', 'adult'].includes(String(settings.galgameAudience))
        ? (settings.galgameAudience as GalgameAudience)
        : defaults.galgameAudience,
      excludes: { ...defaults.excludes },
      tagFilters: { ...defaults.tagFilters },
    }
    for (const key of Object.keys(next.excludes) as ExcludeKey[]) {
      next.excludes[key] = Boolean(settings.excludes?.[key])
    }
    for (const key of tagFilterKeys) {
      next.tagFilters[key] = Boolean(settings.tagFilters?.[key])
    }
    if (next.scoreMin > next.scoreMax) [next.scoreMin, next.scoreMax] = [next.scoreMax, next.scoreMin]
    if (next.yearMin > next.yearMax) [next.yearMin, next.yearMax] = [next.yearMax, next.yearMin]
    return next
  }

  private sanitizeMode(value: unknown): Mode {
    return value === 'timed' ? 'timed' : 'classic'
  }

  private sanitizeLength(mode: Mode, value: unknown) {
    const raw = Number.parseInt(String(value), 10)
    if (mode === 'timed') return Number.isFinite(raw) ? Math.max(30, Math.min(600, raw)) : 90
    return Number.isFinite(raw) ? Math.max(1, Math.min(50, raw)) : 10
  }

  private yearOf(anime: Anime) {
    const year = Number.parseInt(String(anime.date ?? '').slice(0, 4), 10)
    return Number.isFinite(year) ? year : 0
  }

  private matchesAny(anime: Anime, terms: string[]) {
    const text = `${anime.platform ?? ''} ${(anime.tags ?? []).join(' ')}`.toLowerCase()
    return terms.some((term) => text.includes(term.toLowerCase()))
  }

  private isExcluded(anime: Anime, settings: Settings) {
    if (settings.mediaKind !== 'anime' || anime.mediaKind !== 'anime') return false
    return (Object.keys(settings.excludes) as ExcludeKey[]).some(
      (key) => settings.excludes[key] && this.matchesAny(anime, excludeTerms[key]),
    )
  }

  private hasTag(anime: Anime, terms: string[]) {
    const tags = (anime.tags ?? []).map((tag) => String(tag).toLowerCase())
    return terms.some((term) => tags.includes(term.toLowerCase()))
  }

  private matchesTagFilter(anime: Anime, key: MediaTagFilterKey) {
    if (key === 'mangaCompleted' || key === 'lightNovelCompleted') {
      return this.hasTag(anime, ['已完结', '完结', '已完結', '完結'])
    }
    return this.matchesAny(anime, tagFilterTerms[key] ?? [])
  }

  private matchesMediaTagFilters(anime: Anime, settings: Settings) {
    if (anime.mediaKind === 'manga') {
      if (settings.tagFilters.mangaShort && this.matchesTagFilter(anime, 'mangaShort')) return false
      if (settings.tagFilters.mangaMedium && this.matchesTagFilter(anime, 'mangaMedium')) return false
      if (settings.tagFilters.mangaFourPanel && this.matchesTagFilter(anime, 'mangaFourPanel')) return false
      if (settings.tagFilters.mangaNovelAdapted && this.matchesTagFilter(anime, 'mangaNovelAdapted')) return false
      if (settings.tagFilters.mangaCompleted && !this.matchesTagFilter(anime, 'mangaCompleted')) return false
    }
    if (anime.mediaKind === 'lightNovel') {
      if (settings.tagFilters.lightNovelWeb && this.matchesTagFilter(anime, 'lightNovelWeb')) return false
      if (settings.tagFilters.lightNovelCompleted && !this.matchesTagFilter(anime, 'lightNovelCompleted')) return false
    }
    return true
  }

  private filterSubjects(settings: Settings) {
    return (this.allSubjects.get(settings.mediaKind) ?? []).filter((anime) => {
      const year = this.yearOf(anime)
      const inYear = year === 0 || (year >= settings.yearMin && year <= settings.yearMax)
      if (anime.votes < settings.minVotes || !inYear) return false
      if (anime.score < settings.scoreMin || anime.score > settings.scoreMax) return false
      if (settings.mediaKind === 'galgame' && settings.galgameAudience === 'allAges' && anime.adult) return false
      if (settings.mediaKind === 'galgame' && settings.galgameAudience === 'adult' && !anime.adult) return false
      if (!this.matchesMediaTagFilters(anime, settings)) return false
      if (this.isExcluded(anime, settings)) return false
      if (settings.ranking === 'top500') return anime.rank !== null && anime.rank <= 500
      if (settings.ranking === 'top2000') return anime.rank !== null && anime.rank <= 2000
      if (settings.ranking === 'middle') return anime.rank !== null && anime.rank >= 1200 && anime.rank <= 4500
      if (settings.ranking === 'deep') return anime.rank !== null && anime.rank >= 4500
      return true
    })
  }

  private roomCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = ''
    do {
      code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
    } while (this.rooms.has(code))
    return code
  }

  private cleanNickname(value: unknown) {
    const nickname = String(value ?? '').trim().slice(0, 16)
    return nickname || '鉴分员'
  }

  private pickPair(pool: Anime[]): RoundPair | null {
    if (pool.length < 2) return null
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const left = pool[Math.floor(Math.random() * pool.length)]
      const right = pool[Math.floor(Math.random() * pool.length)]
      if (left && right && left.id !== right.id && left.score !== right.score) return { left, right }
    }
    return null
  }

  private judge(pair: RoundPair, side: Side) {
    const winningSide: Side = pair.left.score > pair.right.score ? 'left' : 'right'
    return {
      correct: side === winningSide,
      winningSide,
      diff: Math.abs(pair.left.score - pair.right.score),
    }
  }

  private publicAnime(anime: Anime) {
    return {
      id: anime.id,
      mediaKind: anime.mediaKind,
      name: anime.name,
      nameCn: anime.nameCn,
      score: anime.score,
      votes: anime.votes,
      rank: anime.rank,
      date: anime.date,
      image: anime.image,
      platform: anime.platform,
      adult: Boolean(anime.adult),
    }
  }

  private publicPair(pair: RoundPair | null, reveal = false) {
    if (!pair) return null
    const left = this.publicAnime(pair.left)
    const right = this.publicAnime(pair.right)
    if (!reveal) {
      delete (left as Partial<Anime>).score
      delete (right as Partial<Anime>).score
    }
    return { left, right }
  }

  private publicPlayers(room: Room) {
    return [...room.players.values()].map((player) => ({
      id: player.id,
      nickname: player.nickname,
      isHost: player.id === room.hostId,
      score: player.score,
      total: player.total,
      streak: player.streak,
      answered: room.answers.has(player.id),
    }))
  }

  private send(ws: WebSocket, message: unknown) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message))
  }

  private findRoomFor(ws: WebSocket) {
    const client = this.clients.get(ws)
    return client?.roomCode ? this.rooms.get(client.roomCode) : null
  }

  private roomPayload(room: Room, playerIdForClient: string) {
    return {
      code: room.code,
      youId: playerIdForClient,
      hostId: room.hostId,
      status: room.status,
      mode: room.mode,
      mediaKind: room.settings.mediaKind,
      length: room.mode === 'timed' ? room.timedSeconds : room.classicRounds,
      settings: room.settings,
      poolCount: room.poolCount,
      players: this.publicPlayers(room),
    }
  }

  private gamePayload(room: Room, playerIdForClient: string) {
    if (room.status === 'lobby') return null
    const reveal = room.status === 'reveal' || room.status === 'ended'
    const player = room.players.get(playerIdForClient)
    const pair = room.mode === 'timed' ? player?.pair : room.pair
    const selectedSide = room.mode === 'classic' ? (room.answers.get(playerIdForClient)?.selectedSide ?? null) : null
    return {
      status: room.status,
      mode: room.mode,
      round: room.round,
      length: room.mode === 'timed' ? room.timedSeconds : room.classicRounds,
      startAt: room.startAt,
      durationMs: room.durationMs,
      endsAt: room.endsAt,
      pair: this.publicPair(pair ?? null, reveal && room.mode === 'classic'),
      selectedSide,
      reveal: room.mode === 'classic' && reveal ? room.reveal : player?.lastResult ?? null,
    }
  }

  private broadcastRoom(room: Room) {
    for (const player of room.players.values()) {
      this.send(player.ws, { type: 'roomState', room: this.roomPayload(room, player.id) })
      const game = this.gamePayload(room, player.id)
      if (game) this.send(player.ws, { type: 'gameState', game })
    }
  }

  private updateRoomSettings(room: Room, payload: Record<string, unknown>) {
    if (room.status !== 'lobby') return
    const payloadSettings = payload.settings as Partial<Settings> | undefined
    room.mode = this.sanitizeMode(payload.mode)
    room.settings = this.sanitizeSettings({
      ...payloadSettings,
      mediaKind: this.sanitizeMediaKind(payload.mediaKind ?? payloadSettings?.mediaKind),
    })
    room.classicRounds = this.sanitizeLength('classic', payload.classicRounds ?? payload.length)
    room.timedSeconds = this.sanitizeLength('timed', payload.timedSeconds ?? payload.length)
    room.poolCount = this.filterSubjects(room.settings).length
  }

  private requireHost(ws: WebSocket, room: Room) {
    const client = this.clients.get(ws)
    if (!client || client.playerId !== room.hostId) {
      this.send(ws, { type: 'error', message: '只有房主可以操作比赛设置。' })
      return false
    }
    return true
  }

  private attachPlayer(ws: WebSocket, room: Room, nickname: unknown, isHost = false) {
    const id = crypto.randomUUID()
    const player: Player = {
      id,
      ws,
      nickname: this.cleanNickname(nickname),
      score: 0,
      total: 0,
      streak: 0,
      pair: null,
      lastResult: null,
    }
    room.players.set(id, player)
    if (isHost) room.hostId = id
    this.clients.set(ws, { roomCode: room.code, playerId: id })
    return player
  }

  private createRoom(ws: WebSocket, payload: Record<string, unknown>) {
    const code = this.roomCode()
    const mode = this.sanitizeMode(payload.mode)
    const payloadSettings = payload.settings as Partial<Settings> | undefined
    const settings = this.sanitizeSettings({
      ...payloadSettings,
      mediaKind: this.sanitizeMediaKind(payload.mediaKind ?? payloadSettings?.mediaKind),
    })
    const room: Room = {
      code,
      hostId: '',
      status: 'lobby',
      mode,
      settings,
      classicRounds: this.sanitizeLength('classic', payload.classicRounds ?? payload.length),
      timedSeconds: this.sanitizeLength('timed', payload.timedSeconds ?? payload.length),
      poolCount: this.filterSubjects(settings).length,
      players: new Map(),
      answers: new Map(),
      round: 0,
      pair: null,
      pool: [],
      reveal: null,
      startAt: null,
      durationMs: null,
      endsAt: null,
      timer: null,
      advanceTimer: null,
    }
    this.rooms.set(code, room)
    this.attachPlayer(ws, room, payload.nickname, true)
    this.broadcastRoom(room)
  }

  private joinRoom(ws: WebSocket, payload: Record<string, unknown>) {
    const code = String(payload.roomCode ?? '').trim().toUpperCase()
    const room = this.rooms.get(code)
    if (!room) {
      this.send(ws, { type: 'error', message: '没有找到这个房间。' })
      return
    }
    if (room.players.size >= maxPlayers) {
      this.send(ws, { type: 'error', message: '房间已满。' })
      return
    }
    if (room.status !== 'lobby') {
      this.send(ws, { type: 'error', message: '比赛已经开始，暂时不能加入。' })
      return
    }
    this.attachPlayer(ws, room, payload.nickname)
    this.broadcastRoom(room)
  }

  private startGame(ws: WebSocket) {
    const room = this.findRoomFor(ws)
    if (!room || !this.requireHost(ws, room)) return
    room.pool = this.filterSubjects(room.settings)
    if (!this.pickPair(room.pool)) {
      this.send(ws, { type: 'error', message: '当前筛选下题目不足，或评分都相同。' })
      return
    }
    for (const player of room.players.values()) {
      player.score = 0
      player.total = 0
      player.streak = 0
      player.lastResult = null
      player.pair = null
    }
    room.status = 'question'
    room.round = 1
    room.reveal = null
    room.answers = new Map()
    if (room.timer) clearTimeout(room.timer)
    if (room.advanceTimer) clearTimeout(room.advanceTimer)
    if (room.mode === 'timed') {
      room.startAt = Date.now()
      room.durationMs = room.timedSeconds * 1000
      room.endsAt = room.startAt + room.durationMs
      for (const player of room.players.values()) player.pair = this.pickPair(room.pool)
      room.timer = setTimeout(() => this.endRoom(room, '时间到'), room.durationMs)
    } else {
      room.startAt = null
      room.durationMs = null
      room.endsAt = null
      room.pair = this.pickPair(room.pool)
    }
    this.broadcastRoom(room)
  }

  private nextClassicQuestion(room: Room) {
    if (room.status !== 'reveal') return
    if (room.round >= room.classicRounds) {
      this.endRoom(room, '比赛结束')
      return
    }
    room.round += 1
    room.status = 'question'
    room.answers = new Map()
    room.reveal = null
    room.pair = this.pickPair(room.pool)
    if (!room.pair) {
      this.endRoom(room, '题库用完')
      return
    }
    this.broadcastRoom(room)
  }

  private endRoom(room: Room, reason: string) {
    if (room.timer) clearTimeout(room.timer)
    if (room.advanceTimer) clearTimeout(room.advanceTimer)
    room.status = 'ended'
    room.reveal = room.reveal ?? { reason }
    this.broadcastRoom(room)
  }

  private returnToLobby(ws: WebSocket) {
    const room = this.findRoomFor(ws)
    if (!room || room.status !== 'ended') return
    if (room.timer) clearTimeout(room.timer)
    if (room.advanceTimer) clearTimeout(room.advanceTimer)
    room.status = 'lobby'
    room.answers = new Map()
    room.round = 0
    room.pair = null
    room.pool = []
    room.reveal = null
    room.startAt = null
    room.durationMs = null
    room.endsAt = null
    for (const player of room.players.values()) {
      player.pair = null
      player.lastResult = null
    }
    this.broadcastRoom(room)
  }

  private answer(ws: WebSocket, payload: Record<string, unknown>) {
    const room = this.findRoomFor(ws)
    const client = this.clients.get(ws)
    const side = payload.side === 'right' ? 'right' : 'left'
    if (!room || !client || room.status !== 'question') return
    const player = room.players.get(client.playerId)
    if (!player) return

    if (room.mode === 'timed') {
      if (!room.endsAt || Date.now() >= room.endsAt || !player.pair) {
        this.endRoom(room, '时间到')
        return
      }
      const result = this.judge(player.pair, side)
      player.total += 1
      player.score += result.correct ? 1 : 0
      player.streak = result.correct ? player.streak + 1 : 0
      player.lastResult = { selectedSide: side, ...result, pair: this.publicPair(player.pair, true) }
      player.pair = this.pickPair(room.pool)
      room.round = Math.max(room.round, player.total + 1)
      this.send(player.ws, { type: 'gameState', game: this.gamePayload(room, player.id) })
      this.broadcastRoom(room)
      return
    }

    if (room.answers.has(player.id) || !room.pair) return
    const result = this.judge(room.pair, side)
    room.answers.set(player.id, { selectedSide: side, ...result })
    const activePlayerIds = [...room.players.keys()]
    if (activePlayerIds.every((id) => room.answers.has(id))) {
      for (const id of activePlayerIds) {
        const answerResult = room.answers.get(id)
        const target = room.players.get(id)
        if (!answerResult || !target) continue
        target.total += 1
        target.score += answerResult.correct ? 1 : 0
        target.streak = answerResult.correct ? target.streak + 1 : 0
      }
      room.status = 'reveal'
      room.reveal = {
        pair: this.publicPair(room.pair, true),
        answers: Object.fromEntries(room.answers),
        reason: '本题结算',
      }
      this.broadcastRoom(room)
      room.advanceTimer = setTimeout(() => this.nextClassicQuestion(room), 1500)
    } else {
      this.broadcastRoom(room)
    }
  }

  private updateNickname(ws: WebSocket, payload: Record<string, unknown>) {
    const room = this.findRoomFor(ws)
    const client = this.clients.get(ws)
    if (!room || !client) return
    const player = room.players.get(client.playerId)
    if (!player) return
    player.nickname = this.cleanNickname(payload.nickname)
    this.broadcastRoom(room)
  }

  private leave(ws: WebSocket) {
    const client = this.clients.get(ws)
    if (!client) return
    const room = this.rooms.get(client.roomCode)
    this.clients.delete(ws)
    if (!room) return
    room.players.delete(client.playerId)
    room.answers.delete(client.playerId)
    if (room.players.size === 0) {
      if (room.timer) clearTimeout(room.timer)
      if (room.advanceTimer) clearTimeout(room.advanceTimer)
      this.rooms.delete(room.code)
      return
    }
    if (room.hostId === client.playerId) {
      const nextHostId = room.players.keys().next().value
      if (nextHostId) room.hostId = nextHostId
    }
    this.broadcastRoom(room)
  }
}
