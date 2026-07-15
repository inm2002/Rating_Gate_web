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
  SEED_BASE_URL?: string
  ADMIN_TOKEN?: string
}

interface AnalyticsAnswer {
  leftId: number
  rightId: number
  selectedId: number
}

type AnalyticsSource = 'solo' | 'multiplayer' | 'unknown'
type AnalyticsPreset = 'standard' | 'akashi' | 'brahmin' | 'custom' | 'unknown'

interface AnalyticsPayload {
  version?: number
  source?: 'solo' | 'multiplayer'
  gameId?: string
  mediaKind?: MediaKind
  mode?: Mode
  length?: number
  preset?: string | null
  answers?: AnalyticsAnswer[]
}

interface DistributionStats {
  buckets: number[]
  total: number
  updatedAt: string
}

interface ConsentStats {
  shownCount: number
  acceptedCount: number
  declinedCount: number
  updatedAt: string
}

interface AdminRateStats {
  count: number
  resetAt: number
  blockedUntil: number
  updatedAt: string
}

interface PublicRateStats {
  count: number
  resetAt: number
  blockedUntil: number
}

interface PairStats {
  mediaKind: MediaKind
  mode: Mode
  subjectAId: number
  subjectBId: number
  scoreA: number
  scoreB: number
  scoreDiffBucket: string
  shownCount: number
  correctCount: number
  wrongCount: number
  aSelectedCount: number
  bSelectedCount: number
  aWinnerCount: number
  bWinnerCount: number
  aWinnerCorrectCount: number
  bWinnerCorrectCount: number
  updatedAt: string
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
const adminRateWindowMs = 10 * 60 * 1000
const adminRateBlockMs = 10 * 60 * 1000
const adminMaxFailedAttempts = 8
const publicRateWindowMs = 60 * 1000
const publicRateBlockMs = 60 * 1000
const publicRateLimits = {
  results: 40,
  consent: 30,
  benchmark: 120,
} as const
const currentYear = new Date().getFullYear()
const mediaKinds: MediaKind[] = ['anime', 'manga', 'lightNovel', 'galgame']
const publicBenchmarkMinSamples = 30
const benchmarkCacheTtlMs = 2 * 60 * 1000
const seedFiles: Record<MediaKind, string> = {
  anime: 'anime-seed.json',
  manga: 'manga-seed.json',
  lightNovel: 'light-novel-seed.json',
  galgame: 'galgame-seed.json',
}
const seedMetaFiles: Record<MediaKind, string> = {
  anime: 'anime-seed-meta.json',
  manga: 'manga-seed-meta.json',
  lightNovel: 'light-novel-seed-meta.json',
  galgame: 'galgame-seed-meta.json',
}
const coverCacheTtl = 60 * 60 * 24 * 30
const analyticsV2SchemaVersion = 2
const analyticsSeenRetentionDays = 14
const analyticsLegacyPageSize = 1000
const coverHosts = new Set(['lain.bgm.tv', 'bgm.tv', 'bangumi.tv', 'chii.in'])
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
    if (url.pathname.startsWith('/api/cover')) {
      return handleCoverProxy(request)
    }
    if (
      !url.pathname.startsWith('/ws') &&
      !url.pathname.startsWith('/websocket') &&
      !url.pathname.startsWith('/api/results') &&
      !url.pathname.startsWith('/api/analytics/consent') &&
      !url.pathname.startsWith('/api/analytics/benchmark') &&
      !url.pathname.startsWith('/api/admin/analytics')
    ) {
      return new Response('Not found', { status: 404 })
    }
    const id = env.ROOM_HUB.idFromName('global-room-hub')
    return env.ROOM_HUB.get(id).fetch(request)
  },
}

function coverProxyHeaders(contentType = 'image/jpeg') {
  return {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': `public, max-age=${coverCacheTtl}, s-maxage=${coverCacheTtl}, stale-while-revalidate=86400`,
    'Content-Type': contentType,
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'X-Content-Type-Options': 'nosniff',
  }
}

async function handleCoverProxy(request: Request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: coverProxyHeaders() })
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return Response.json({ ok: false, error: 'method_not_allowed' }, { status: 405 })
  }

  const url = new URL(request.url)
  const src = url.searchParams.get('src')
  if (!src) return Response.json({ ok: false, error: 'missing_src' }, { status: 400 })

  let upstreamUrl: URL
  try {
    upstreamUrl = new URL(src)
  } catch {
    return Response.json({ ok: false, error: 'invalid_src' }, { status: 400 })
  }

  if (upstreamUrl.protocol !== 'https:' || !coverHosts.has(upstreamUrl.hostname)) {
    return Response.json({ ok: false, error: 'unsupported_src' }, { status: 400 })
  }

  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      headers: {
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'user-agent': 'RatingGate/1.0 (+https://ratinggate.cn)',
      },
      cf: { cacheEverything: true, cacheTtl: coverCacheTtl },
    })
    const contentType = upstream.headers.get('Content-Type') ?? 'image/jpeg'
    if (!upstream.ok || !contentType.toLowerCase().startsWith('image/')) {
      return Response.json({ ok: false, error: 'cover_unavailable' }, { status: 502 })
    }
    if (request.method === 'HEAD') {
      return new Response(null, { status: 200, headers: coverProxyHeaders(contentType) })
    }
    return new Response(upstream.body, { status: 200, headers: coverProxyHeaders(contentType) })
  } catch {
    return Response.json({ ok: false, error: 'cover_fetch_failed' }, { status: 502 })
  }
}

export class RoomHub {
  private state: DurableObjectState
  private env: Env
  private rooms = new Map<string, Room>()
  private clients = new Map<WebSocket, { roomCode: string; playerId: string }>()
  private allSubjects = new Map<MediaKind, Anime[]>()
  private seedVersions = new Map<MediaKind, string>()
  private seedPromises = new Map<MediaKind, Promise<Anime[]>>()
  private publicRate = new Map<string, PublicRateStats>()
  private benchmarkCache = new Map<string, { expiresAt: number; stats: DistributionStats }>()

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
    this.ensureAnalyticsV2Schema()
  }

  private ensureAnalyticsV2Schema() {
    const sql = this.state.storage.sql
    sql.exec(`
      CREATE TABLE IF NOT EXISTS analytics_v2_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS analytics_v2_seen_games (
        game_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS analytics_v2_seen_games_created_idx
        ON analytics_v2_seen_games(created_at);
      CREATE TABLE IF NOT EXISTS analytics_v2_games_daily (
        day TEXT NOT NULL,
        media_kind TEXT NOT NULL,
        mode TEXT NOT NULL,
        source TEXT NOT NULL,
        length INTEGER NOT NULL,
        preset TEXT NOT NULL,
        game_count INTEGER NOT NULL DEFAULT 0,
        answer_count INTEGER NOT NULL DEFAULT 0,
        correct_count INTEGER NOT NULL DEFAULT 0,
        bucket_0 INTEGER NOT NULL DEFAULT 0,
        bucket_1 INTEGER NOT NULL DEFAULT 0,
        bucket_2 INTEGER NOT NULL DEFAULT 0,
        bucket_3 INTEGER NOT NULL DEFAULT 0,
        bucket_4 INTEGER NOT NULL DEFAULT 0,
        bucket_5 INTEGER NOT NULL DEFAULT 0,
        bucket_6 INTEGER NOT NULL DEFAULT 0,
        bucket_7 INTEGER NOT NULL DEFAULT 0,
        bucket_8 INTEGER NOT NULL DEFAULT 0,
        bucket_9 INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(day, media_kind, mode, source, length, preset)
      );
      CREATE TABLE IF NOT EXISTS analytics_v2_pairs (
        media_kind TEXT NOT NULL,
        mode TEXT NOT NULL,
        source TEXT NOT NULL,
        subject_a_id INTEGER NOT NULL,
        subject_b_id INTEGER NOT NULL,
        score_a REAL NOT NULL,
        score_b REAL NOT NULL,
        votes_a INTEGER NOT NULL,
        votes_b INTEGER NOT NULL,
        score_diff_bucket TEXT NOT NULL,
        seed_version TEXT NOT NULL,
        shown_count INTEGER NOT NULL DEFAULT 0,
        correct_count INTEGER NOT NULL DEFAULT 0,
        wrong_count INTEGER NOT NULL DEFAULT 0,
        a_selected_count INTEGER NOT NULL DEFAULT 0,
        b_selected_count INTEGER NOT NULL DEFAULT 0,
        a_winner_count INTEGER NOT NULL DEFAULT 0,
        b_winner_count INTEGER NOT NULL DEFAULT 0,
        a_winner_correct_count INTEGER NOT NULL DEFAULT 0,
        b_winner_correct_count INTEGER NOT NULL DEFAULT 0,
        a_shown_left_count INTEGER NOT NULL DEFAULT 0,
        a_shown_right_count INTEGER NOT NULL DEFAULT 0,
        selected_left_count INTEGER NOT NULL DEFAULT 0,
        selected_right_count INTEGER NOT NULL DEFAULT 0,
        winner_left_count INTEGER NOT NULL DEFAULT 0,
        winner_right_count INTEGER NOT NULL DEFAULT 0,
        first_seen_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(media_kind, mode, source, subject_a_id, subject_b_id)
      );
      CREATE TABLE IF NOT EXISTS analytics_v2_pairs_daily (
        day TEXT NOT NULL,
        media_kind TEXT NOT NULL,
        mode TEXT NOT NULL,
        source TEXT NOT NULL,
        subject_a_id INTEGER NOT NULL,
        subject_b_id INTEGER NOT NULL,
        shown_count INTEGER NOT NULL DEFAULT 0,
        correct_count INTEGER NOT NULL DEFAULT 0,
        wrong_count INTEGER NOT NULL DEFAULT 0,
        a_selected_count INTEGER NOT NULL DEFAULT 0,
        b_selected_count INTEGER NOT NULL DEFAULT 0,
        selected_left_count INTEGER NOT NULL DEFAULT 0,
        selected_right_count INTEGER NOT NULL DEFAULT 0,
        winner_left_count INTEGER NOT NULL DEFAULT 0,
        winner_right_count INTEGER NOT NULL DEFAULT 0,
        score_a REAL NOT NULL,
        score_b REAL NOT NULL,
        seed_version TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(day, media_kind, mode, source, subject_a_id, subject_b_id)
      );
      CREATE TABLE IF NOT EXISTS analytics_v2_segments_daily (
        day TEXT NOT NULL,
        media_kind TEXT NOT NULL,
        mode TEXT NOT NULL,
        source TEXT NOT NULL,
        diff_bucket TEXT NOT NULL,
        round_bucket TEXT NOT NULL,
        shown_count INTEGER NOT NULL DEFAULT 0,
        correct_count INTEGER NOT NULL DEFAULT 0,
        selected_left_count INTEGER NOT NULL DEFAULT 0,
        selected_right_count INTEGER NOT NULL DEFAULT 0,
        winner_left_count INTEGER NOT NULL DEFAULT 0,
        winner_right_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(day, media_kind, mode, source, diff_bucket, round_bucket)
      );
      CREATE TABLE IF NOT EXISTS analytics_v2_consent_daily (
        day TEXT PRIMARY KEY,
        shown_count INTEGER NOT NULL DEFAULT 0,
        accepted_count INTEGER NOT NULL DEFAULT 0,
        declined_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
    `)
    const now = new Date().toISOString()
    sql.exec(
      `INSERT INTO analytics_v2_meta(key, value, updated_at) VALUES('schema_version', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      String(analyticsV2SchemaVersion),
      now,
    )
  }

  async fetch(request: Request) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: this.corsHeaders() })
    if (url.pathname.startsWith('/api/analytics/consent')) {
      return this.handleAnalyticsConsent(request)
    }
    if (url.pathname.startsWith('/api/analytics/benchmark')) {
      return this.handleAnalyticsBenchmark(request)
    }
    if (url.pathname.startsWith('/api/admin/analytics')) {
      return this.handleAdminAnalytics(request)
    }
    if (url.pathname.startsWith('/api/results')) {
      return this.handleAnalyticsResult(request)
    }

    const upgradeHeader = request.headers.get('upgrade')
    if (upgradeHeader?.toLowerCase() === 'websocket') {
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)
      server.accept()
      this.open(server)
      return new Response(null, { status: 101, webSocket: client })
    }

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

  private corsHeaders() {
    return {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type',
      'cache-control': 'no-store',
    }
  }

  private apiHeaders(cacheControl = 'no-store') {
    return {
      ...this.corsHeaders(),
      'cache-control': cacheControl,
    }
  }

  private async loadSubjectSeed(mediaKind: MediaKind, request: Request) {
    const cached = this.allSubjects.get(mediaKind)
    if (cached) return cached
    const existing = this.seedPromises.get(mediaKind)
    if (existing) return existing
    const origin = new URL(request.url).origin
    const seedBaseUrl = this.env.SEED_BASE_URL?.replace(/\/$/, '')
    const animeSeedUrl = mediaKind === 'anime' ? this.env.SEED_URL : undefined
    const baseUrl = seedBaseUrl || origin
    const promise = fetch(animeSeedUrl || `${baseUrl}/${seedFiles[mediaKind]}`, {
      headers: {
        accept: 'application/json',
        'user-agent': 'RatingGate/1.0 (+https://ratinggate.cn)',
      },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Failed to load ${mediaKind} seed: HTTP ${response.status}`)
        const rows = (await response.json()) as Anime[]
        const subjects = rows.map((row) => ({ ...row, mediaKind: row.mediaKind ?? mediaKind }))
        this.allSubjects.set(mediaKind, subjects)
        try {
          const metaResponse = await fetch(`${baseUrl}/${seedMetaFiles[mediaKind]}`, {
            headers: {
              accept: 'application/json',
              'user-agent': 'RatingGate/1.0 (+https://ratinggate.cn)',
            },
          })
          if (metaResponse.ok) {
            const meta = (await metaResponse.json()) as { generatedAt?: string }
            this.seedVersions.set(mediaKind, String(meta.generatedAt ?? 'unknown').slice(0, 40))
          }
        } catch {
          // 题库版本只用于分析复现，读取失败不影响游戏或统计写入。
        }
        return subjects
      })
      .catch((error) => {
        this.seedPromises.delete(mediaKind)
        throw error
      })
    this.seedPromises.set(mediaKind, promise)
    return promise
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
    if (payload.type === 'createRoom') void this.createRoom(ws, payload)
    else if (payload.type === 'joinRoom') this.joinRoom(ws, payload)
    else if (payload.type === 'updateSettings' && room && this.requireHost(ws, room)) {
      void this.updateRoomSettings(room, payload)
    } else if (payload.type === 'startGame') void this.startGame(ws)
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

  private accuracyBucket(correct: number, total: number) {
    if (total <= 0) return 0
    const accuracy = Math.max(0, Math.min(100, Math.round((correct / total) * 100)))
    return Math.min(9, Math.floor(accuracy / 10))
  }

  private diffBucket(diff: number) {
    if (diff <= 0.2) return '0-0.2'
    if (diff <= 0.5) return '0.3-0.5'
    if (diff <= 1) return '0.6-1.0'
    return '1.1+'
  }

  private analyticsLength(mode: Mode, value: unknown) {
    const raw = this.sanitizeLength(mode, value)
    return mode === 'timed' ? raw : Math.max(1, Math.min(50, raw))
  }

  private analyticsSource(value: unknown): AnalyticsSource {
    return value === 'solo' || value === 'multiplayer' ? value : 'unknown'
  }

  private analyticsPreset(value: unknown): AnalyticsPreset {
    return value === 'standard' || value === 'akashi' || value === 'brahmin' || value === 'custom'
      ? value
      : 'unknown'
  }

  private analyticsRoundBucket(index: number) {
    if (index < 5) return '1-5'
    if (index < 10) return '6-10'
    if (index < 20) return '11-20'
    return '21+'
  }

  private async listAllStorage<T>(prefix: string) {
    const all = new Map<string, T>()
    let startAfter: string | undefined
    while (true) {
      const page = await this.state.storage.list<T>({
        prefix,
        limit: analyticsLegacyPageSize,
        ...(startAfter ? { startAfter } : {}),
      })
      for (const [key, value] of page) all.set(key, value)
      if (page.size < analyticsLegacyPageSize) break
      const lastKey = [...page.keys()].at(-1)
      if (!lastKey || lastKey === startAfter) break
      startAfter = lastKey
    }
    return all
  }

  private analyticsSubjectMap(mediaKind: MediaKind) {
    return new Map((this.allSubjects.get(mediaKind) ?? []).map((subject) => [subject.id, subject]))
  }

  private async isLegacyDuplicateGame(gameId: string) {
    const key = 'analytics:recent-games'
    const recent = ((await this.state.storage.get<string[]>(key)) ?? []).slice(-500)
    return recent.includes(gameId)
  }

  private async rememberRecentGame(gameId: string) {
    const key = 'analytics:recent-games'
    const recent = ((await this.state.storage.get<string[]>(key)) ?? []).slice(-500)
    if (recent.includes(gameId)) return
    recent.push(gameId)
    await this.state.storage.put(key, recent.slice(-500))
  }

  private async handleAnalyticsConsent(request: Request) {
    if (request.method !== 'POST') {
      return Response.json({ ok: false, error: 'method_not_allowed' }, { status: 405, headers: this.apiHeaders() })
    }
    const limited = await this.checkPublicRateLimit(request, 'consent')
    if (limited) return limited
    let event: 'shown' | 'accepted' | 'declined' = 'accepted'
    try {
      const payload = (await request.json()) as { event?: string }
      if (payload.event === 'shown' || payload.event === 'accepted' || payload.event === 'declined') event = payload.event
    } catch {
      event = 'accepted'
    }
    const now = new Date().toISOString()
    const day = now.slice(0, 10)
    const column = event === 'shown' ? 'shown_count' : event === 'declined' ? 'declined_count' : 'accepted_count'
    this.state.storage.sql.exec(
      `INSERT INTO analytics_v2_consent_daily(day, ${column}, updated_at)
       VALUES(?, 1, ?)
       ON CONFLICT(day) DO UPDATE SET ${column} = ${column} + 1, updated_at = excluded.updated_at`,
      day,
      now,
    )
    return Response.json({ ok: true, event }, { headers: this.apiHeaders() })
  }

  private adminTokenFrom(request: Request) {
    const header = request.headers.get('authorization') ?? ''
    if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim()
    return ''
  }

  private adminTokenMatches(actual: string, expected: string) {
    const maxLength = Math.max(actual.length, expected.length)
    let diff = actual.length ^ expected.length
    for (let index = 0; index < maxLength; index += 1) {
      diff |= (actual.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0)
    }
    return diff === 0
  }

  private adminClientFingerprint(request: Request) {
    const forwarded = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? 'local'
    const userAgent = request.headers.get('user-agent') ?? 'unknown'
    return `${forwarded.split(',')[0].trim()}|${userAgent.slice(0, 120)}`
  }

  private async adminRateKey(request: Request) {
    const data = new TextEncoder().encode(this.adminClientFingerprint(request))
    const digest = await crypto.subtle.digest('SHA-256', data)
    const hex = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32)
    return `admin:rate:${hex}`
  }

  private async publicRateKey(request: Request, scope: string) {
    const data = new TextEncoder().encode(`${scope}|${this.adminClientFingerprint(request)}`)
    const digest = await crypto.subtle.digest('SHA-256', data)
    const hex = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32)
    return `public:${hex}`
  }

  private prunePublicRate(now: number) {
    if (this.publicRate.size < 5000) return
    for (const [key, stats] of this.publicRate.entries()) {
      if (stats.resetAt <= now && stats.blockedUntil <= now) this.publicRate.delete(key)
    }
  }

  private async checkPublicRateLimit(request: Request, scope: keyof typeof publicRateLimits) {
    const now = Date.now()
    this.prunePublicRate(now)
    const key = await this.publicRateKey(request, scope)
    const current = this.publicRate.get(key)
    if (current && current.blockedUntil > now) {
      const retryAfter = Math.max(1, Math.ceil((current.blockedUntil - now) / 1000))
      return Response.json(
        { ok: false, error: 'rate_limited', retryAfter },
        { status: 429, headers: { ...this.apiHeaders(), 'retry-after': String(retryAfter) } },
      )
    }
    const stats =
      current && current.resetAt > now
        ? current
        : ({ count: 0, resetAt: now + publicRateWindowMs, blockedUntil: 0 } satisfies PublicRateStats)
    stats.count += 1
    if (stats.count > publicRateLimits[scope]) stats.blockedUntil = now + publicRateBlockMs
    this.publicRate.set(key, stats)
    if (stats.blockedUntil > now) {
      const retryAfter = Math.ceil((stats.blockedUntil - now) / 1000)
      return Response.json(
        { ok: false, error: 'rate_limited', retryAfter },
        { status: 429, headers: { ...this.apiHeaders(), 'retry-after': String(retryAfter) } },
      )
    }
    return null
  }

  private async checkAdminRateLimit(request: Request) {
    const key = await this.adminRateKey(request)
    const stats = await this.state.storage.get<AdminRateStats>(key)
    const now = Date.now()
    if (!stats) return null
    if (stats.blockedUntil > now) {
      const retryAfter = Math.max(1, Math.ceil((stats.blockedUntil - now) / 1000))
      return Response.json(
        { ok: false, error: 'too_many_attempts', retryAfter },
        { status: 429, headers: { ...this.apiHeaders(), 'retry-after': String(retryAfter) } },
      )
    }
    if (stats.resetAt <= now) await this.state.storage.delete(key)
    return null
  }

  private async recordAdminFailure(request: Request) {
    const key = await this.adminRateKey(request)
    const now = Date.now()
    const current = await this.state.storage.get<AdminRateStats>(key)
    const stats =
      current && current.resetAt > now
        ? current
        : ({ count: 0, resetAt: now + adminRateWindowMs, blockedUntil: 0, updatedAt: '' } satisfies AdminRateStats)
    stats.count += 1
    stats.updatedAt = new Date().toISOString()
    if (stats.count >= adminMaxFailedAttempts) stats.blockedUntil = now + adminRateBlockMs
    await this.state.storage.put(key, stats)
    if (stats.blockedUntil > now) {
      const retryAfter = Math.ceil((stats.blockedUntil - now) / 1000)
      return Response.json(
        { ok: false, error: 'too_many_attempts', retryAfter },
        { status: 429, headers: { ...this.apiHeaders(), 'retry-after': String(retryAfter) } },
      )
    }
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: this.apiHeaders() })
  }

  private async clearAdminRateLimit(request: Request) {
    await this.state.storage.delete(await this.adminRateKey(request))
  }

  private async handleAdminAnalytics(request: Request) {
    if (request.method !== 'GET') {
      return Response.json({ ok: false, error: 'method_not_allowed' }, { status: 405, headers: this.apiHeaders() })
    }
    const expected = this.env.ADMIN_TOKEN?.trim()
    if (!expected) {
      return Response.json({ ok: false, error: 'admin_not_configured' }, { status: 404, headers: this.apiHeaders() })
    }
    const actual = this.adminTokenFrom(request)
    if (this.adminTokenMatches(actual, expected)) {
      await this.clearAdminRateLimit(request)
      const url = new URL(request.url)
      if (url.pathname === '/api/admin/analytics/export') {
        try {
          await this.hydrateAnalyticsSubjectMaps(request)
          return await this.handleAdminAnalyticsExport(url)
        } catch (error) {
          console.error('Failed to export admin analytics', error)
          return Response.json(
            { ok: false, error: 'admin_export_failed' },
            { status: 500, headers: this.apiHeaders() },
          )
        }
      }
      let report: Awaited<ReturnType<RoomHub['buildAnalyticsReport']>>
      try {
        await this.hydrateAnalyticsSubjectMaps(request)
        report = await this.buildAnalyticsReport()
      } catch (error) {
        console.error('Failed to build admin analytics report', error)
        return Response.json(
          { ok: false, error: 'admin_report_failed' },
          { status: 500, headers: this.apiHeaders() },
        )
      }
      return Response.json({ ok: true, ...report }, { headers: this.apiHeaders() })
    }
    const limited = await this.checkAdminRateLimit(request)
    if (limited) return limited
    return this.recordAdminFailure(request)
  }

  private csvCell(value: unknown) {
    const text = value === null || value === undefined ? '' : String(value)
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }

  private async handleAdminAnalyticsExport(url: URL) {
    const exportedAt = new Date().toISOString()
    const legacyDistributions = await this.listAllStorage<DistributionStats>('analytics:distribution:')
    const legacyPairs = await this.listAllStorage<PairStats>('analytics:pair:')
    const v2GamesDaily = this.state.storage.sql.exec<Record<string, string | number>>(
      'SELECT * FROM analytics_v2_games_daily ORDER BY day, media_kind, mode, source, length, preset',
    ).toArray()
    const v2Pairs = this.state.storage.sql.exec<Record<string, string | number>>(
      'SELECT * FROM analytics_v2_pairs ORDER BY media_kind, mode, source, subject_a_id, subject_b_id',
    ).toArray()
    const v2PairsDaily = this.state.storage.sql.exec<Record<string, string | number>>(
      'SELECT * FROM analytics_v2_pairs_daily ORDER BY day, media_kind, mode, source, subject_a_id, subject_b_id',
    ).toArray()
    const v2SegmentsDaily = this.state.storage.sql.exec<Record<string, string | number>>(
      'SELECT * FROM analytics_v2_segments_daily ORDER BY day, media_kind, mode, source, diff_bucket, round_bucket',
    ).toArray()
    const v2ConsentDaily = this.state.storage.sql.exec<Record<string, string | number>>(
      'SELECT * FROM analytics_v2_consent_daily ORDER BY day',
    ).toArray()
    const subjectIds = new Map<MediaKind, Set<number>>(mediaKinds.map((kind) => [kind, new Set<number>()]))
    for (const pair of legacyPairs.values()) {
      subjectIds.get(pair.mediaKind)?.add(pair.subjectAId)
      subjectIds.get(pair.mediaKind)?.add(pair.subjectBId)
    }
    for (const pair of v2Pairs) {
      const kind = String(pair.media_kind) as MediaKind
      subjectIds.get(kind)?.add(Number(pair.subject_a_id))
      subjectIds.get(kind)?.add(Number(pair.subject_b_id))
    }
    const subjects = mediaKinds.flatMap((mediaKind) => {
      const ids = subjectIds.get(mediaKind) ?? new Set<number>()
      return (this.allSubjects.get(mediaKind) ?? [])
        .filter((subject) => ids.has(subject.id))
        .map((subject) => ({
          mediaKind,
          id: subject.id,
          name: subject.name,
          nameCn: subject.nameCn,
          score: subject.score,
          votes: subject.votes,
          rank: subject.rank,
          date: subject.date,
          platform: subject.platform,
          tags: subject.tags,
          seedVersion: this.seedVersions.get(mediaKind) ?? 'unknown',
        }))
    })

    if (url.searchParams.get('format') === 'csv') {
      const headers = [
        'era', 'mediaKind', 'mode', 'source', 'subjectAId', 'subjectBId', 'scoreA', 'scoreB',
        'votesA', 'votesB', 'scoreDiffBucket', 'shownCount', 'correctCount', 'wrongCount',
        'aSelectedCount', 'bSelectedCount', 'aShownLeftCount', 'aShownRightCount',
        'selectedLeftCount', 'selectedRightCount', 'winnerLeftCount', 'winnerRightCount',
        'seedVersion', 'firstSeenAt', 'updatedAt',
      ]
      const rows: unknown[][] = []
      for (const pair of legacyPairs.values()) {
        const map = new Map((this.allSubjects.get(pair.mediaKind) ?? []).map((subject) => [subject.id, subject]))
        rows.push([
          'legacy', pair.mediaKind, pair.mode, 'legacy', pair.subjectAId, pair.subjectBId,
          pair.scoreA, pair.scoreB, map.get(pair.subjectAId)?.votes ?? '', map.get(pair.subjectBId)?.votes ?? '',
          pair.scoreDiffBucket, pair.shownCount, pair.correctCount, pair.wrongCount,
          pair.aSelectedCount, pair.bSelectedCount, '', '', '', '', '', '', 'legacy', '', pair.updatedAt,
        ])
      }
      for (const pair of v2Pairs) {
        rows.push([
          'v2', pair.media_kind, pair.mode, pair.source, pair.subject_a_id, pair.subject_b_id,
          pair.score_a, pair.score_b, pair.votes_a, pair.votes_b, pair.score_diff_bucket,
          pair.shown_count, pair.correct_count, pair.wrong_count, pair.a_selected_count, pair.b_selected_count,
          pair.a_shown_left_count, pair.a_shown_right_count, pair.selected_left_count, pair.selected_right_count,
          pair.winner_left_count, pair.winner_right_count, pair.seed_version, pair.first_seen_at, pair.updated_at,
        ])
      }
      const csv = [headers, ...rows].map((row) => row.map((value) => this.csvCell(value)).join(',')).join('\r\n')
      return new Response(`\uFEFF${csv}`, {
        headers: {
          ...this.apiHeaders(),
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="rating-gate-pairs-${exportedAt.slice(0, 10)}.csv"`,
        },
      })
    }

    const overview = await this.buildAnalyticsReport()
    const payload = {
      manifest: {
        product: 'Rating;Gate',
        exportVersion: 1,
        analyticsSchemaVersion: analyticsV2SchemaVersion,
        exportedAt,
        timezone: 'UTC',
        privacy: 'Anonymous aggregate data only. No IP, user agent, nickname, room code, admin token, or per-user history.',
        counts: {
          legacyDistributions: legacyDistributions.size,
          legacyPairs: legacyPairs.size,
          v2GamesDaily: v2GamesDaily.length,
          v2Pairs: v2Pairs.length,
          v2PairsDaily: v2PairsDaily.length,
          v2SegmentsDaily: v2SegmentsDaily.length,
          v2ConsentDaily: v2ConsentDaily.length,
          subjects: subjects.length,
        },
      },
      overview,
      legacy: {
        note: 'Historical v1 aggregates. Missing dimensions are intentionally marked legacy/unknown.',
        distributions: [...legacyDistributions].map(([key, value]) => ({ key, ...value })),
        pairs: [...legacyPairs.values()].map((pair) => ({ ...pair, source: 'legacy' })),
      },
      v2: {
        gamesDaily: v2GamesDaily,
        pairs: v2Pairs,
        pairsDaily: v2PairsDaily,
        segmentsDaily: v2SegmentsDaily,
        consentDaily: v2ConsentDaily,
      },
      subjects,
      dataDictionary: {
        era: 'legacy means data collected before schema v2; v2 means the extensible daily aggregate schema.',
        source: 'solo, multiplayer, unknown, or legacy.',
        accuracyBuckets: 'bucket_0 through bucket_9 represent 0-9% through 90-100%.',
        scoreDiffBucket: 'Absolute Bangumi score difference: 0-0.2, 0.3-0.5, 0.6-1.0, or 1.1+.',
        roundBucket: 'Answer position within a submitted game: 1-5, 6-10, 11-20, or 21+.',
      },
    }
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        ...this.apiHeaders(),
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="rating-gate-analytics-${exportedAt.slice(0, 10)}.json"`,
      },
    })
  }

  private async handleAnalyticsBenchmark(request: Request) {
    if (request.method !== 'GET') {
      return Response.json({ ok: false, error: 'method_not_allowed' }, { status: 405, headers: this.apiHeaders() })
    }
    const limited = await this.checkPublicRateLimit(request, 'benchmark')
    if (limited) return limited
    const url = new URL(request.url)
    const mediaKind = this.sanitizeMediaKind(url.searchParams.get('mediaKind'))
    const mode = this.sanitizeMode(url.searchParams.get('mode'))
    const stats = await this.aggregateDistributionStats(mediaKind, mode)
    return Response.json(
      {
        ok: true,
        mediaKind,
        mode,
        buckets:
          stats.total >= publicBenchmarkMinSamples
            ? stats.buckets.slice(0, 10).map((value) => Math.max(0, Number(value) || 0))
            : Array.from({ length: 10 }, () => 0),
        total: Math.max(0, Number(stats.total) || 0),
        updatedAt: stats.updatedAt,
      },
      { headers: this.apiHeaders('public, max-age=60, s-maxage=120') },
    )
  }

  private async aggregateDistributionStats(mediaKind: MediaKind, mode: Mode) {
    const cacheKey = `${mediaKind}:${mode}`
    const cached = this.benchmarkCache.get(cacheKey)
    const now = Date.now()
    if (cached && cached.expiresAt > now) return cached.stats
    const entries = await this.listAllStorage<DistributionStats>(`analytics:distribution:${mediaKind}:${mode}:`)
    const aggregate = {
      buckets: Array.from({ length: 10 }, () => 0),
      total: 0,
      updatedAt: '',
    } satisfies DistributionStats
    for (const stats of entries.values()) {
      stats.buckets.slice(0, 10).forEach((value, index) => {
        aggregate.buckets[index] = (aggregate.buckets[index] ?? 0) + Math.max(0, Number(value) || 0)
      })
      aggregate.total += Math.max(0, Number(stats.total) || 0)
      if (stats.updatedAt > aggregate.updatedAt) aggregate.updatedAt = stats.updatedAt
    }
    const v2 = this.state.storage.sql.exec<Record<string, string | number>>(`SELECT
      COALESCE(SUM(game_count), 0) AS total,
      COALESCE(SUM(bucket_0), 0) AS bucket_0, COALESCE(SUM(bucket_1), 0) AS bucket_1,
      COALESCE(SUM(bucket_2), 0) AS bucket_2, COALESCE(SUM(bucket_3), 0) AS bucket_3,
      COALESCE(SUM(bucket_4), 0) AS bucket_4, COALESCE(SUM(bucket_5), 0) AS bucket_5,
      COALESCE(SUM(bucket_6), 0) AS bucket_6, COALESCE(SUM(bucket_7), 0) AS bucket_7,
      COALESCE(SUM(bucket_8), 0) AS bucket_8, COALESCE(SUM(bucket_9), 0) AS bucket_9,
      COALESCE(MAX(updated_at), '') AS updated_at
      FROM analytics_v2_games_daily WHERE media_kind = ? AND mode = ?`, mediaKind, mode).one()
    aggregate.total += Math.max(0, Number(v2.total) || 0)
    aggregate.buckets.forEach((_, index) => {
      aggregate.buckets[index] += Math.max(0, Number(v2[`bucket_${index}`]) || 0)
    })
    if (String(v2.updated_at || '') > aggregate.updatedAt) aggregate.updatedAt = String(v2.updated_at)
    this.benchmarkCache.set(cacheKey, { expiresAt: now + benchmarkCacheTtlMs, stats: aggregate })
    return aggregate
  }

  private async buildAnalyticsReport() {
    const legacyConsent =
      (await this.state.storage.get<Partial<ConsentStats>>('analytics:consent:accepted')) ??
      ({ shownCount: 0, acceptedCount: 0, declinedCount: 0, updatedAt: '' } satisfies ConsentStats)
    const v2Consent = this.state.storage.sql.exec<{
      shownCount: number
      acceptedCount: number
      declinedCount: number
      updatedAt: string
    }>(`SELECT
      COALESCE(SUM(shown_count), 0) AS shownCount,
      COALESCE(SUM(accepted_count), 0) AS acceptedCount,
      COALESCE(SUM(declined_count), 0) AS declinedCount,
      COALESCE(MAX(updated_at), '') AS updatedAt
      FROM analytics_v2_consent_daily`).one()
    const consentStats = {
      shownCount: Math.max(0, Number(legacyConsent.shownCount) || 0) + Math.max(0, Number(v2Consent.shownCount) || 0),
      acceptedCount: Math.max(0, Number(legacyConsent.acceptedCount) || 0) + Math.max(0, Number(v2Consent.acceptedCount) || 0),
      declinedCount: Math.max(0, Number(legacyConsent.declinedCount) || 0) + Math.max(0, Number(v2Consent.declinedCount) || 0),
      updatedAt: String(v2Consent.updatedAt || legacyConsent.updatedAt || ''),
    } satisfies ConsentStats
    consentStats.shownCount = Math.max(
      consentStats.shownCount,
      consentStats.acceptedCount + consentStats.declinedCount,
    )
    const distributionEntries = await this.listAllStorage<DistributionStats>('analytics:distribution:')
    const pairEntries = await this.listAllStorage<PairStats>('analytics:pair:')
    const distributionGroups = new Map<string, { mediaKind: MediaKind; mode: Mode; buckets: number[]; total: number; updatedAt: string }>()
    const addDistribution = (mediaKind: MediaKind, mode: Mode, buckets: number[], total: number, updatedAt: string) => {
      if (!mediaKinds.includes(mediaKind) || (mode !== 'classic' && mode !== 'timed')) return
      const groupKey = `${mediaKind}:${mode}`
      const current = distributionGroups.get(groupKey) ?? {
        mediaKind,
        mode,
        buckets: Array.from({ length: 10 }, () => 0),
        total: 0,
        updatedAt: '',
      }
      buckets.slice(0, 10).forEach((value, index) => {
        current.buckets[index] = (current.buckets[index] ?? 0) + Math.max(0, Number(value) || 0)
      })
      current.total += Math.max(0, Number(total) || 0)
      if (updatedAt > current.updatedAt) current.updatedAt = updatedAt
      distributionGroups.set(groupKey, current)
    }
    for (const [key, stats] of distributionEntries.entries()) {
      const [, , mediaKind, mode] = key.split(':') as [string, string, MediaKind, Mode, string]
      addDistribution(mediaKind, mode, stats.buckets, stats.total, stats.updatedAt)
    }
    const v2Distributions = this.state.storage.sql.exec<Record<string, string | number>>(`SELECT
      media_kind, mode,
      SUM(game_count) AS total,
      SUM(bucket_0) AS bucket_0, SUM(bucket_1) AS bucket_1,
      SUM(bucket_2) AS bucket_2, SUM(bucket_3) AS bucket_3,
      SUM(bucket_4) AS bucket_4, SUM(bucket_5) AS bucket_5,
      SUM(bucket_6) AS bucket_6, SUM(bucket_7) AS bucket_7,
      SUM(bucket_8) AS bucket_8, SUM(bucket_9) AS bucket_9,
      MAX(updated_at) AS updated_at
      FROM analytics_v2_games_daily GROUP BY media_kind, mode`).toArray()
    for (const row of v2Distributions) {
      addDistribution(
        String(row.media_kind) as MediaKind,
        String(row.mode) as Mode,
        Array.from({ length: 10 }, (_, index) => Number(row[`bucket_${index}`]) || 0),
        Number(row.total) || 0,
        String(row.updated_at || ''),
      )
    }
    const distributions = [...distributionGroups.values()]
    const accuracyBuckets = Array.from({ length: 10 }, () => 0)
    const byMediaKind: Record<MediaKind, number> = { anime: 0, manga: 0, lightNovel: 0, galgame: 0 }
    const byMode: Record<Mode, number> = { classic: 0, timed: 0 }
    let gameTotal = 0
    let latest = consentStats.updatedAt
    for (const item of distributions) {
      gameTotal += item.total
      if (mediaKinds.includes(item.mediaKind)) byMediaKind[item.mediaKind] += item.total
      if (item.mode === 'classic' || item.mode === 'timed') byMode[item.mode] += item.total
      item.buckets.forEach((value, index) => {
        accuracyBuckets[index] = (accuracyBuckets[index] ?? 0) + value
      })
      if (item.updatedAt > latest) latest = item.updatedAt
    }
    const subjectMaps = new Map(
      mediaKinds.map((kind) => [kind, new Map((this.allSubjects.get(kind) ?? []).map((subject) => [subject.id, subject]))]),
    )
    const pairGroups = new Map<string, PairStats>()
    const addPair = (pair: PairStats) => {
      if (!mediaKinds.includes(pair.mediaKind) || (pair.mode !== 'classic' && pair.mode !== 'timed')) return
      const key = `${pair.mediaKind}:${pair.mode}:${pair.subjectAId}:${pair.subjectBId}`
      const current = pairGroups.get(key)
      if (!current) {
        pairGroups.set(key, {
          ...pair,
          shownCount: Math.max(0, Number(pair.shownCount) || 0),
          correctCount: Math.max(0, Number(pair.correctCount) || 0),
          wrongCount: Math.max(0, Number(pair.wrongCount) || 0),
          aSelectedCount: Math.max(0, Number(pair.aSelectedCount) || 0),
          bSelectedCount: Math.max(0, Number(pair.bSelectedCount) || 0),
          aWinnerCount: Math.max(0, Number(pair.aWinnerCount) || 0),
          bWinnerCount: Math.max(0, Number(pair.bWinnerCount) || 0),
          aWinnerCorrectCount: Math.max(0, Number(pair.aWinnerCorrectCount) || 0),
          bWinnerCorrectCount: Math.max(0, Number(pair.bWinnerCorrectCount) || 0),
        })
        return
      }
      current.shownCount += Math.max(0, Number(pair.shownCount) || 0)
      current.correctCount += Math.max(0, Number(pair.correctCount) || 0)
      current.wrongCount += Math.max(0, Number(pair.wrongCount) || 0)
      current.aSelectedCount += Math.max(0, Number(pair.aSelectedCount) || 0)
      current.bSelectedCount += Math.max(0, Number(pair.bSelectedCount) || 0)
      current.aWinnerCount += Math.max(0, Number(pair.aWinnerCount) || 0)
      current.bWinnerCount += Math.max(0, Number(pair.bWinnerCount) || 0)
      current.aWinnerCorrectCount += Math.max(0, Number(pair.aWinnerCorrectCount) || 0)
      current.bWinnerCorrectCount += Math.max(0, Number(pair.bWinnerCorrectCount) || 0)
      current.scoreA = pair.scoreA
      current.scoreB = pair.scoreB
      current.scoreDiffBucket = pair.scoreDiffBucket
      if (pair.updatedAt > current.updatedAt) current.updatedAt = pair.updatedAt
    }
    for (const pair of pairEntries.values()) addPair(pair)
    const v2Pairs = this.state.storage.sql.exec<Record<string, string | number>>(`SELECT
      media_kind, mode, subject_a_id, subject_b_id,
      MAX(score_a) AS score_a, MAX(score_b) AS score_b,
      MAX(score_diff_bucket) AS score_diff_bucket,
      SUM(shown_count) AS shown_count, SUM(correct_count) AS correct_count,
      SUM(wrong_count) AS wrong_count, SUM(a_selected_count) AS a_selected_count,
      SUM(b_selected_count) AS b_selected_count, SUM(a_winner_count) AS a_winner_count,
      SUM(b_winner_count) AS b_winner_count,
      SUM(a_winner_correct_count) AS a_winner_correct_count,
      SUM(b_winner_correct_count) AS b_winner_correct_count,
      MAX(updated_at) AS updated_at
      FROM analytics_v2_pairs
      GROUP BY media_kind, mode, subject_a_id, subject_b_id`).toArray()
    for (const row of v2Pairs) {
      addPair({
        mediaKind: String(row.media_kind) as MediaKind,
        mode: String(row.mode) as Mode,
        subjectAId: Number(row.subject_a_id),
        subjectBId: Number(row.subject_b_id),
        scoreA: Number(row.score_a),
        scoreB: Number(row.score_b),
        scoreDiffBucket: String(row.score_diff_bucket),
        shownCount: Number(row.shown_count) || 0,
        correctCount: Number(row.correct_count) || 0,
        wrongCount: Number(row.wrong_count) || 0,
        aSelectedCount: Number(row.a_selected_count) || 0,
        bSelectedCount: Number(row.b_selected_count) || 0,
        aWinnerCount: Number(row.a_winner_count) || 0,
        bWinnerCount: Number(row.b_winner_count) || 0,
        aWinnerCorrectCount: Number(row.a_winner_correct_count) || 0,
        bWinnerCorrectCount: Number(row.b_winner_correct_count) || 0,
        updatedAt: String(row.updated_at || ''),
      })
    }
    const pairs = [...pairGroups.values()]
    let pairShownTotal = 0
    let pairCorrectTotal = 0
    let pairWrongTotal = 0
    const topPairs = pairs
      .map((pair) => {
        pairShownTotal += pair.shownCount
        pairCorrectTotal += pair.correctCount
        pairWrongTotal += pair.wrongCount
        if (pair.updatedAt > latest) latest = pair.updatedAt
        const subjects = subjectMaps.get(pair.mediaKind)
        const subjectA = subjects?.get(pair.subjectAId)
        const subjectB = subjects?.get(pair.subjectBId)
        return {
          mediaKind: pair.mediaKind,
          mode: pair.mode,
          subjectAId: pair.subjectAId,
          subjectBId: pair.subjectBId,
          subjectAName: subjectA ? this.titleOf(subjectA) : `#${pair.subjectAId}`,
          subjectBName: subjectB ? this.titleOf(subjectB) : `#${pair.subjectBId}`,
          scoreA: pair.scoreA,
          scoreB: pair.scoreB,
          scoreDiffBucket: pair.scoreDiffBucket,
          shownCount: pair.shownCount,
          correctCount: pair.correctCount,
          wrongCount: pair.wrongCount,
          accuracy: pair.shownCount > 0 ? Math.round((pair.correctCount / pair.shownCount) * 100) : 0,
          updatedAt: pair.updatedAt,
        }
      })
      .sort((a, b) => b.shownCount - a.shownCount || b.wrongCount - a.wrongCount)
      .slice(0, 30)

    return {
      generatedAt: new Date().toISOString(),
      updatedAt: latest,
      consent: consentStats,
      games: {
        total: gameTotal,
        byMediaKind,
        byMode,
        accuracyBuckets,
        distributions,
      },
      pairs: {
        scannedPairs: pairs.length,
        totalShown: pairShownTotal,
        totalCorrect: pairCorrectTotal,
        totalWrong: pairWrongTotal,
        topPairs,
      },
      storage: {
        schemaVersion: analyticsV2SchemaVersion,
        legacyPairCount: pairEntries.size,
        v2PairRows: v2Pairs.length,
      },
    }
  }

  private async hydrateAnalyticsSubjectMaps(request: Request) {
    const pairEntries = await this.listAllStorage<PairStats>('analytics:pair:')
    const neededKinds = new Set<MediaKind>()
    for (const pair of pairEntries.values()) {
      if (mediaKinds.includes(pair.mediaKind)) neededKinds.add(pair.mediaKind)
    }
    for (const row of this.state.storage.sql.exec<{ media_kind: string }>('SELECT DISTINCT media_kind FROM analytics_v2_pairs')) {
      if (mediaKinds.includes(row.media_kind as MediaKind)) neededKinds.add(row.media_kind as MediaKind)
    }
    await Promise.all(
      [...neededKinds].map((mediaKind) =>
        this.loadSubjectSeed(mediaKind, request).catch((error) => {
          console.error(`Failed to load ${mediaKind} names for admin analytics`, error)
        }),
      ),
    )
  }

  private async handleAnalyticsResult(request: Request) {
    if (request.method !== 'POST') {
      return Response.json({ ok: false, error: 'method_not_allowed' }, { status: 405, headers: this.apiHeaders() })
    }
    const limited = await this.checkPublicRateLimit(request, 'results')
    if (limited) return limited
    const contentLength = Number.parseInt(request.headers.get('content-length') ?? '0', 10)
    if (Number.isFinite(contentLength) && contentLength > 24000) {
      return Response.json({ ok: false, error: 'payload_too_large' }, { status: 413, headers: this.apiHeaders() })
    }

    let payload: AnalyticsPayload
    try {
      payload = (await request.json()) as AnalyticsPayload
    } catch {
      return Response.json({ ok: false, error: 'invalid_json' }, { status: 400, headers: this.apiHeaders() })
    }

    const mediaKind = this.sanitizeMediaKind(payload.mediaKind)
    const mode = this.sanitizeMode(payload.mode)
    const source = this.analyticsSource(payload.source)
    const preset = this.analyticsPreset(payload.preset)
    const length = this.analyticsLength(mode, payload.length)
    const answers = Array.isArray(payload.answers) ? payload.answers.slice(0, 80) : []
    const gameId = String(payload.gameId ?? '').trim().slice(0, 80)
    if (!gameId || answers.length === 0) {
      return Response.json({ ok: false, error: 'missing_game' }, { status: 400, headers: this.apiHeaders() })
    }
    if (await this.isLegacyDuplicateGame(gameId)) {
      return Response.json({ ok: true, duplicate: true }, { headers: this.apiHeaders() })
    }

    try {
      await this.loadSubjectSeed(mediaKind, request)
    } catch (error) {
      console.error('Failed to load analytics seed', error)
      return Response.json({ ok: false, error: 'analytics_seed_load_failed' }, { status: 500, headers: this.apiHeaders() })
    }
    const subjects = this.analyticsSubjectMap(mediaKind)
    const validAnswers = answers
      .map((answer) => this.normalizeAnalyticsAnswer(answer, subjects))
      .filter((answer): answer is NonNullable<ReturnType<typeof this.normalizeAnalyticsAnswer>> => Boolean(answer))
    if (validAnswers.length === 0) {
      return Response.json({ ok: false, error: 'no_valid_answers' }, { status: 400, headers: this.apiHeaders() })
    }

    const correct = validAnswers.filter((answer) => answer.correct).length
    const stored = this.storeAnalyticsV2({
      gameId,
      mediaKind,
      mode,
      source,
      preset,
      length,
      correct,
      answers: validAnswers,
    })
    if (!stored) return Response.json({ ok: true, duplicate: true }, { headers: this.apiHeaders() })
    await this.rememberRecentGame(gameId)
    this.benchmarkCache.delete(`${mediaKind}:${mode}`)
    return Response.json(
      {
        ok: true,
        acceptedAnswers: validAnswers.length,
        correct,
        distributionKey: `analytics:v2:${mediaKind}:${mode}:${source}:${length}`,
      },
      { headers: this.apiHeaders() },
    )
  }

  private normalizeAnalyticsAnswer(answer: AnalyticsAnswer, subjects: Map<number, Anime>) {
    const left = subjects.get(Number(answer.leftId))
    const right = subjects.get(Number(answer.rightId))
    const selectedId = Number(answer.selectedId)
    if (!left || !right || left.id === right.id || left.score === right.score) return null
    if (selectedId !== left.id && selectedId !== right.id) return null
    const winner = left.score > right.score ? left : right
    const selected = selectedId === left.id ? left : right
    return {
      left,
      right,
      selected,
      winner,
      correct: selected.id === winner.id,
      diff: Math.abs(left.score - right.score),
    }
  }

  private storeAnalyticsV2(input: {
    gameId: string
    mediaKind: MediaKind
    mode: Mode
    source: AnalyticsSource
    preset: AnalyticsPreset
    length: number
    correct: number
    answers: NonNullable<ReturnType<RoomHub['normalizeAnalyticsAnswer']>>[]
  }) {
    const now = new Date().toISOString()
    const day = now.slice(0, 10)
    const seedVersion = this.seedVersions.get(input.mediaKind) ?? 'unknown'
    const bucket = this.accuracyBucket(input.correct, input.answers.length)
    const bucketColumn = `bucket_${bucket}`
    const cutoff = new Date(Date.now() - analyticsSeenRetentionDays * 24 * 60 * 60 * 1000).toISOString()
    return this.state.storage.transactionSync(() => {
      const inserted = this.state.storage.sql.exec(
        'INSERT OR IGNORE INTO analytics_v2_seen_games(game_id, created_at) VALUES(?, ?)',
        input.gameId,
        now,
      )
      if (inserted.rowsWritten === 0) return false

      this.state.storage.sql.exec('DELETE FROM analytics_v2_seen_games WHERE created_at < ?', cutoff)
      this.state.storage.sql.exec(
        `INSERT INTO analytics_v2_games_daily(
          day, media_kind, mode, source, length, preset, game_count, answer_count, correct_count, ${bucketColumn}, updated_at
        ) VALUES(?, ?, ?, ?, ?, ?, 1, ?, ?, 1, ?)
        ON CONFLICT(day, media_kind, mode, source, length, preset) DO UPDATE SET
          game_count = game_count + 1,
          answer_count = answer_count + excluded.answer_count,
          correct_count = correct_count + excluded.correct_count,
          ${bucketColumn} = ${bucketColumn} + 1,
          updated_at = excluded.updated_at`,
        day,
        input.mediaKind,
        input.mode,
        input.source,
        input.length,
        input.preset,
        input.answers.length,
        input.correct,
        now,
      )

      input.answers.forEach((answer, index) => {
        const [subjectA, subjectB] =
          answer.left.id < answer.right.id ? [answer.left, answer.right] : [answer.right, answer.left]
        const aSelected = answer.selected.id === subjectA.id ? 1 : 0
        const bSelected = aSelected ? 0 : 1
        const aWinner = answer.winner.id === subjectA.id ? 1 : 0
        const bWinner = aWinner ? 0 : 1
        const aWinnerCorrect = aWinner && answer.correct ? 1 : 0
        const bWinnerCorrect = bWinner && answer.correct ? 1 : 0
        const aShownLeft = answer.left.id === subjectA.id ? 1 : 0
        const selectedLeft = answer.selected.id === answer.left.id ? 1 : 0
        const winnerLeft = answer.winner.id === answer.left.id ? 1 : 0
        const diffBucket = this.diffBucket(answer.diff)

        this.state.storage.sql.exec(
          `INSERT INTO analytics_v2_pairs(
            media_kind, mode, source, subject_a_id, subject_b_id, score_a, score_b, votes_a, votes_b,
            score_diff_bucket, seed_version, shown_count, correct_count, wrong_count,
            a_selected_count, b_selected_count, a_winner_count, b_winner_count,
            a_winner_correct_count, b_winner_correct_count, a_shown_left_count, a_shown_right_count,
            selected_left_count, selected_right_count, winner_left_count, winner_right_count,
            first_seen_at, updated_at
          ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(media_kind, mode, source, subject_a_id, subject_b_id) DO UPDATE SET
            score_a = excluded.score_a, score_b = excluded.score_b,
            votes_a = excluded.votes_a, votes_b = excluded.votes_b,
            score_diff_bucket = excluded.score_diff_bucket, seed_version = excluded.seed_version,
            shown_count = shown_count + 1,
            correct_count = correct_count + excluded.correct_count,
            wrong_count = wrong_count + excluded.wrong_count,
            a_selected_count = a_selected_count + excluded.a_selected_count,
            b_selected_count = b_selected_count + excluded.b_selected_count,
            a_winner_count = a_winner_count + excluded.a_winner_count,
            b_winner_count = b_winner_count + excluded.b_winner_count,
            a_winner_correct_count = a_winner_correct_count + excluded.a_winner_correct_count,
            b_winner_correct_count = b_winner_correct_count + excluded.b_winner_correct_count,
            a_shown_left_count = a_shown_left_count + excluded.a_shown_left_count,
            a_shown_right_count = a_shown_right_count + excluded.a_shown_right_count,
            selected_left_count = selected_left_count + excluded.selected_left_count,
            selected_right_count = selected_right_count + excluded.selected_right_count,
            winner_left_count = winner_left_count + excluded.winner_left_count,
            winner_right_count = winner_right_count + excluded.winner_right_count,
            updated_at = excluded.updated_at`,
          input.mediaKind, input.mode, input.source, subjectA.id, subjectB.id,
          subjectA.score, subjectB.score, subjectA.votes, subjectB.votes,
          diffBucket, seedVersion, answer.correct ? 1 : 0, answer.correct ? 0 : 1,
          aSelected, bSelected, aWinner, bWinner, aWinnerCorrect, bWinnerCorrect,
          aShownLeft, aShownLeft ? 0 : 1, selectedLeft, selectedLeft ? 0 : 1,
          winnerLeft, winnerLeft ? 0 : 1, now, now,
        )

        this.state.storage.sql.exec(
          `INSERT INTO analytics_v2_pairs_daily(
            day, media_kind, mode, source, subject_a_id, subject_b_id,
            shown_count, correct_count, wrong_count, a_selected_count, b_selected_count,
            selected_left_count, selected_right_count, winner_left_count, winner_right_count,
            score_a, score_b, seed_version, updated_at
          ) VALUES(?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(day, media_kind, mode, source, subject_a_id, subject_b_id) DO UPDATE SET
            shown_count = shown_count + 1,
            correct_count = correct_count + excluded.correct_count,
            wrong_count = wrong_count + excluded.wrong_count,
            a_selected_count = a_selected_count + excluded.a_selected_count,
            b_selected_count = b_selected_count + excluded.b_selected_count,
            selected_left_count = selected_left_count + excluded.selected_left_count,
            selected_right_count = selected_right_count + excluded.selected_right_count,
            winner_left_count = winner_left_count + excluded.winner_left_count,
            winner_right_count = winner_right_count + excluded.winner_right_count,
            score_a = excluded.score_a, score_b = excluded.score_b,
            seed_version = excluded.seed_version, updated_at = excluded.updated_at`,
          day, input.mediaKind, input.mode, input.source, subjectA.id, subjectB.id,
          answer.correct ? 1 : 0, answer.correct ? 0 : 1, aSelected, bSelected,
          selectedLeft, selectedLeft ? 0 : 1, winnerLeft, winnerLeft ? 0 : 1,
          subjectA.score, subjectB.score, seedVersion, now,
        )

        const roundBucket = this.analyticsRoundBucket(index)
        this.state.storage.sql.exec(
          `INSERT INTO analytics_v2_segments_daily(
            day, media_kind, mode, source, diff_bucket, round_bucket,
            shown_count, correct_count, selected_left_count, selected_right_count,
            winner_left_count, winner_right_count, updated_at
          ) VALUES(?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(day, media_kind, mode, source, diff_bucket, round_bucket) DO UPDATE SET
            shown_count = shown_count + 1,
            correct_count = correct_count + excluded.correct_count,
            selected_left_count = selected_left_count + excluded.selected_left_count,
            selected_right_count = selected_right_count + excluded.selected_right_count,
            winner_left_count = winner_left_count + excluded.winner_left_count,
            winner_right_count = winner_right_count + excluded.winner_right_count,
            updated_at = excluded.updated_at`,
          day, input.mediaKind, input.mode, input.source, diffBucket, roundBucket,
          answer.correct ? 1 : 0, selectedLeft, selectedLeft ? 0 : 1,
          winnerLeft, winnerLeft ? 0 : 1, now,
        )
      })
      return true
    })
  }

  private yearOf(anime: Anime) {
    const year = Number.parseInt(String(anime.date ?? '').slice(0, 4), 10)
    return Number.isFinite(year) ? year : 0
  }

  private titleOf(anime: Anime) {
    return anime.nameCn || anime.name || `#${anime.id}`
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

  private async updateRoomSettings(room: Room, payload: Record<string, unknown>) {
    if (room.status !== 'lobby') return
    const payloadSettings = payload.settings as Partial<Settings> | undefined
    room.mode = this.sanitizeMode(payload.mode)
    room.settings = this.sanitizeSettings({
      ...payloadSettings,
      mediaKind: this.sanitizeMediaKind(payload.mediaKind ?? payloadSettings?.mediaKind),
    })
    room.classicRounds = this.sanitizeLength('classic', payload.classicRounds ?? payload.length)
    room.timedSeconds = this.sanitizeLength('timed', payload.timedSeconds ?? payload.length)
    try {
      await this.loadSubjectSeed(room.settings.mediaKind, new Request('https://ratinggate.cn/ws'))
    } catch (error) {
      console.error('Failed to load room settings seed', error)
      this.send(room.players.get(room.hostId)?.ws as WebSocket, {
        type: 'error',
        message: '题库数据暂时读取失败，请稍后再试。',
      })
      return
    }
    room.poolCount = this.filterSubjects(room.settings).length
    this.broadcastRoom(room)
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

  private async createRoom(ws: WebSocket, payload: Record<string, unknown>) {
    const code = this.roomCode()
    const mode = this.sanitizeMode(payload.mode)
    const payloadSettings = payload.settings as Partial<Settings> | undefined
    const settings = this.sanitizeSettings({
      ...payloadSettings,
      mediaKind: this.sanitizeMediaKind(payload.mediaKind ?? payloadSettings?.mediaKind),
    })
    try {
      await this.loadSubjectSeed(settings.mediaKind, new Request('https://ratinggate.cn/ws'))
    } catch (error) {
      console.error('Failed to load create room seed', error)
      this.send(ws, { type: 'error', message: '题库数据暂时读取失败，请稍后再试。' })
      return
    }
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

  private async startGame(ws: WebSocket) {
    const room = this.findRoomFor(ws)
    if (!room || !this.requireHost(ws, room)) return
    try {
      await this.loadSubjectSeed(room.settings.mediaKind, new Request('https://ratinggate.cn/ws'))
    } catch (error) {
      console.error('Failed to load start game seed', error)
      this.send(ws, { type: 'error', message: '题库数据暂时读取失败，请稍后再试。' })
      return
    }
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
