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

interface AnalyticsPayload {
  version?: number
  source?: 'solo' | 'multiplayer'
  gameId?: string
  mediaKind?: MediaKind
  mode?: Mode
  length?: number
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
const coverCacheTtl = 60 * 60 * 24 * 30
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
  private seedPromises = new Map<MediaKind, Promise<Anime[]>>()
  private publicRate = new Map<string, PublicRateStats>()
  private benchmarkCache = new Map<string, { expiresAt: number; stats: DistributionStats }>()

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
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
    const promise = fetch(animeSeedUrl || `${seedBaseUrl || origin}/${seedFiles[mediaKind]}`, {
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

  private analyticsSubjectMap(mediaKind: MediaKind) {
    return new Map((this.allSubjects.get(mediaKind) ?? []).map((subject) => [subject.id, subject]))
  }

  private async isDuplicateGame(gameId: string) {
    const key = 'analytics:recent-games'
    const recent = ((await this.state.storage.get<string[]>(key)) ?? []).slice(-500)
    if (recent.includes(gameId)) return true
    recent.push(gameId)
    await this.state.storage.put(key, recent.slice(-500))
    return false
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
    const key = 'analytics:consent:accepted'
    const saved = await this.state.storage.get<Partial<ConsentStats>>(key)
    const current = {
      shownCount: saved?.shownCount ?? 0,
      acceptedCount: saved?.acceptedCount ?? 0,
      declinedCount: saved?.declinedCount ?? 0,
      updatedAt: saved?.updatedAt ?? '',
    } satisfies ConsentStats
    if (event === 'shown') current.shownCount += 1
    if (event === 'accepted') current.acceptedCount += 1
    if (event === 'declined') current.declinedCount += 1
    current.updatedAt = new Date().toISOString()
    await this.state.storage.put(key, current)
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
    const entries = await this.state.storage.list<DistributionStats>({
      prefix: `analytics:distribution:${mediaKind}:${mode}:`,
      limit: 1000,
    })
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
    this.benchmarkCache.set(cacheKey, { expiresAt: now + benchmarkCacheTtlMs, stats: aggregate })
    return aggregate
  }

  private async buildAnalyticsReport() {
    const consent =
      (await this.state.storage.get<Partial<ConsentStats>>('analytics:consent:accepted')) ??
      ({ shownCount: 0, acceptedCount: 0, declinedCount: 0, updatedAt: '' } satisfies ConsentStats)
    const consentStats = {
      shownCount: consent.shownCount ?? 0,
      acceptedCount: consent.acceptedCount ?? 0,
      declinedCount: consent.declinedCount ?? 0,
      updatedAt: consent.updatedAt ?? '',
    } satisfies ConsentStats
    consentStats.shownCount = Math.max(
      consentStats.shownCount,
      consentStats.acceptedCount + consentStats.declinedCount,
    )
    const distributionEntries = await this.state.storage.list<DistributionStats>({
      prefix: 'analytics:distribution:',
      limit: 1000,
    })
    const pairEntries = await this.state.storage.list<PairStats>({ prefix: 'analytics:pair:', limit: 1000 })
    const distributionGroups = new Map<string, { mediaKind: MediaKind; mode: Mode; buckets: number[]; total: number; updatedAt: string }>()
    for (const [key, stats] of distributionEntries.entries()) {
      const [, , mediaKind, mode] = key.split(':') as [string, string, MediaKind, Mode, string]
      if (!mediaKinds.includes(mediaKind) || (mode !== 'classic' && mode !== 'timed')) continue
      const groupKey = `${mediaKind}:${mode}`
      const current =
        distributionGroups.get(groupKey) ??
        ({ mediaKind, mode, buckets: Array.from({ length: 10 }, () => 0), total: 0, updatedAt: '' } satisfies {
          mediaKind: MediaKind
          mode: Mode
          buckets: number[]
          total: number
          updatedAt: string
        })
      stats.buckets.slice(0, 10).forEach((value, index) => {
        current.buckets[index] = (current.buckets[index] ?? 0) + Math.max(0, Number(value) || 0)
      })
      current.total += Math.max(0, Number(stats.total) || 0)
      if (stats.updatedAt > current.updatedAt) current.updatedAt = stats.updatedAt
      distributionGroups.set(groupKey, current)
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
    const pairs = [...pairEntries.values()]
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
    }
  }

  private async hydrateAnalyticsSubjectMaps(request: Request) {
    const pairEntries = await this.state.storage.list<PairStats>({ prefix: 'analytics:pair:', limit: 1000 })
    const neededKinds = new Set<MediaKind>()
    for (const pair of pairEntries.values()) {
      if (mediaKinds.includes(pair.mediaKind)) neededKinds.add(pair.mediaKind)
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
    const length = this.analyticsLength(mode, payload.length)
    const answers = Array.isArray(payload.answers) ? payload.answers.slice(0, 80) : []
    const gameId = String(payload.gameId ?? '').trim().slice(0, 80)
    if (!gameId || answers.length === 0) {
      return Response.json({ ok: false, error: 'missing_game' }, { status: 400, headers: this.apiHeaders() })
    }
    if (await this.isDuplicateGame(gameId)) {
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
    await this.updateDistributionStats(mediaKind, mode, length, correct, validAnswers.length)
    await this.updatePairStats(mediaKind, mode, validAnswers)
    return Response.json(
      {
        ok: true,
        acceptedAnswers: validAnswers.length,
        correct,
        distributionKey: `analytics:distribution:${mediaKind}:${mode}:${length}`,
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

  private async updateDistributionStats(
    mediaKind: MediaKind,
    mode: Mode,
    length: number,
    correct: number,
    total: number,
  ) {
    const key = `analytics:distribution:${mediaKind}:${mode}:${length}`
    const current =
      (await this.state.storage.get<DistributionStats>(key)) ??
      ({ buckets: Array.from({ length: 10 }, () => 0), total: 0, updatedAt: '' } satisfies DistributionStats)
    const bucket = this.accuracyBucket(correct, total)
    current.buckets[bucket] = (current.buckets[bucket] ?? 0) + 1
    current.total += 1
    current.updatedAt = new Date().toISOString()
    await this.state.storage.put(key, current)
    this.benchmarkCache.delete(`${mediaKind}:${mode}`)
  }

  private async updatePairStats(
    mediaKind: MediaKind,
    mode: Mode,
    answers: NonNullable<ReturnType<typeof this.normalizeAnalyticsAnswer>>[],
  ) {
    const now = new Date().toISOString()
    for (const answer of answers) {
      const [subjectA, subjectB] =
        answer.left.id < answer.right.id ? [answer.left, answer.right] : [answer.right, answer.left]
      const key = `analytics:pair:${mediaKind}:${mode}:${subjectA.id}:${subjectB.id}`
      const current =
        (await this.state.storage.get<PairStats>(key)) ??
        ({
          mediaKind,
          mode,
          subjectAId: subjectA.id,
          subjectBId: subjectB.id,
          scoreA: subjectA.score,
          scoreB: subjectB.score,
          scoreDiffBucket: this.diffBucket(Math.abs(subjectA.score - subjectB.score)),
          shownCount: 0,
          correctCount: 0,
          wrongCount: 0,
          aSelectedCount: 0,
          bSelectedCount: 0,
          aWinnerCount: 0,
          bWinnerCount: 0,
          aWinnerCorrectCount: 0,
          bWinnerCorrectCount: 0,
          updatedAt: '',
        } satisfies PairStats)
      current.shownCount += 1
      current.correctCount += answer.correct ? 1 : 0
      current.wrongCount += answer.correct ? 0 : 1
      if (answer.selected.id === subjectA.id) current.aSelectedCount += 1
      else current.bSelectedCount += 1
      if (answer.winner.id === subjectA.id) {
        current.aWinnerCount += 1
        if (answer.correct) current.aWinnerCorrectCount += 1
      } else {
        current.bWinnerCount += 1
        if (answer.correct) current.bWinnerCorrectCount += 1
      }
      current.scoreA = subjectA.score
      current.scoreB = subjectB.score
      current.scoreDiffBucket = this.diffBucket(answer.diff)
      current.updatedAt = now
      await this.state.storage.put(key, current)
    }
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
