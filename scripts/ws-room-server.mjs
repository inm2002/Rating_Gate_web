import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const host = process.env.BGM_WS_HOST ?? '127.0.0.1'
const port = Number.parseInt(process.env.BGM_WS_PORT ?? '8787', 10)
const maxPlayers = 8
const currentYear = new Date().getFullYear()

const allSubjects = new Map()
const mediaKinds = ['anime', 'manga', 'lightNovel', 'galgame']
const seedFiles = {
  anime: 'anime-seed.json',
  manga: 'manga-seed.json',
  lightNovel: 'light-novel-seed.json',
  galgame: 'galgame-seed.json',
}

const presetExcludeDefaults = ['guochan', 'movies', 'oumei', 'recap']
const tagFilterKeys = [
  'mangaShort',
  'mangaMedium',
  'mangaFourPanel',
  'mangaCompleted',
  'mangaNovelAdapted',
  'lightNovelWeb',
  'lightNovelCompleted',
]
const excludeTerms = {
  guochan: ['国产', '国漫', '中国', '中国大陆', '大陆'],
  movies: ['剧场版', '劇場版', '剧场', '劇場', '映画'],
  ova: ['OVA', 'OAD'],
  pamen: ['泡面番', '泡面'],
  oumei: ['欧美', '美国', '英国', '法国', '加拿大', '欧洲'],
  short: ['短片', '短篇', 'Short'],
  recap: ['总集篇', '總集篇', '总集', '總集', 'Recap'],
}

const tagFilterTerms = {
  mangaShort: ['短篇'],
  mangaMedium: ['中篇'],
  mangaFourPanel: ['四格', '4格'],
  mangaNovelAdapted: ['小说改', '小說改', '轻小说改', '輕小說改'],
  lightNovelWeb: ['web', 'web小说', 'web小說', '小説家になろう'],
}

const rooms = new Map()
const clients = new Map()

export async function loadSubjectSeeds(seedDir = join(rootDir, 'public')) {
  if (allSubjects.size === mediaKinds.length) return allSubjects
  await Promise.all(
    mediaKinds.map(async (mediaKind) => {
      const seedPath = join(seedDir, seedFiles[mediaKind])
      const rows = JSON.parse(await readFile(seedPath, 'utf8'))
      allSubjects.set(
        mediaKind,
        rows.map((row) => ({ ...row, mediaKind: row.mediaKind ?? mediaKind })),
      )
    }),
  )
  return allSubjects
}

export function roomCount() {
  return rooms.size
}

function sanitizeMediaKind(value) {
  return mediaKinds.includes(value) ? value : 'anime'
}

function createDefaultSettings(mediaKind = 'anime') {
  return {
    mediaKind,
    minVotes: mediaKind === 'anime' ? 100 : 50,
    scoreMin: 0,
    scoreMax: 10,
    yearMin: 1900,
    yearMax: currentYear,
    ranking: 'all',
    galgameAudience: 'all',
    excludes: Object.fromEntries(
      ['guochan', 'movies', 'ova', 'pamen', 'oumei', 'short', 'recap'].map((key) => [
        key,
        mediaKind === 'anime' && presetExcludeDefaults.includes(key),
      ]),
    ),
    tagFilters: Object.fromEntries(tagFilterKeys.map((key) => [key, false])),
  }
}

function sanitizeSettings(settings = {}) {
  const mediaKind = sanitizeMediaKind(settings.mediaKind)
  const defaults = createDefaultSettings(mediaKind)
  const minVotes = Number.parseInt(settings.minVotes, 10)
  const scoreMin = Number.parseFloat(settings.scoreMin)
  const scoreMax = Number.parseFloat(settings.scoreMax)
  const yearMin = Number.parseInt(settings.yearMin, 10)
  const yearMax = Number.parseInt(settings.yearMax, 10)
  const next = {
    mediaKind,
    minVotes: Number.isFinite(minVotes) ? Math.max(defaults.minVotes, Math.min(5000, minVotes)) : defaults.minVotes,
    scoreMin: Number.isFinite(scoreMin) ? Math.max(0, Math.min(10, scoreMin)) : defaults.scoreMin,
    scoreMax: Number.isFinite(scoreMax) ? Math.max(0, Math.min(10, scoreMax)) : defaults.scoreMax,
    yearMin: Number.isFinite(yearMin) ? Math.max(1900, Math.min(2030, yearMin)) : defaults.yearMin,
    yearMax: Number.isFinite(yearMax) ? Math.max(1900, Math.min(2030, yearMax)) : defaults.yearMax,
    ranking: ['all', 'top500', 'top2000', 'middle', 'deep'].includes(settings.ranking)
      ? settings.ranking
      : defaults.ranking,
    galgameAudience: ['all', 'allAges', 'adult'].includes(settings.galgameAudience)
      ? settings.galgameAudience
      : defaults.galgameAudience,
    excludes: { ...defaults.excludes },
    tagFilters: { ...defaults.tagFilters },
  }
  for (const key of Object.keys(next.excludes)) next.excludes[key] = Boolean(settings.excludes?.[key])
  for (const key of tagFilterKeys) next.tagFilters[key] = Boolean(settings.tagFilters?.[key])
  if (next.scoreMin > next.scoreMax) [next.scoreMin, next.scoreMax] = [next.scoreMax, next.scoreMin]
  if (next.yearMin > next.yearMax) [next.yearMin, next.yearMax] = [next.yearMax, next.yearMin]
  return next
}

function sanitizeMode(value) {
  return value === 'timed' ? 'timed' : 'classic'
}

function sanitizeLength(mode, value) {
  const raw = Number.parseInt(value, 10)
  if (mode === 'timed') return Number.isFinite(raw) ? Math.max(30, Math.min(600, raw)) : 90
  return Number.isFinite(raw) ? Math.max(1, Math.min(50, raw)) : 10
}

function yearOf(anime) {
  const year = Number.parseInt(String(anime.date ?? '').slice(0, 4), 10)
  return Number.isFinite(year) ? year : 0
}

function matchesAny(anime, terms) {
  const text = `${anime.platform ?? ''} ${(anime.tags ?? []).join(' ')}`.toLowerCase()
  return terms.some((term) => text.includes(term.toLowerCase()))
}

function isExcluded(anime, settings) {
  if (settings.mediaKind !== 'anime' || anime.mediaKind !== 'anime') return false
  return Object.keys(settings.excludes).some((key) => settings.excludes[key] && matchesAny(anime, excludeTerms[key]))
}

function hasTag(anime, terms) {
  const tags = (anime.tags ?? []).map((tag) => String(tag).toLowerCase())
  return terms.some((term) => tags.includes(term.toLowerCase()))
}

function matchesTagFilter(anime, key) {
  if (key === 'mangaCompleted' || key === 'lightNovelCompleted') {
    return hasTag(anime, ['已完结', '完结', '已完結', '完結'])
  }
  return matchesAny(anime, tagFilterTerms[key] ?? [])
}

function matchesMediaTagFilters(anime, settings) {
  if (anime.mediaKind === 'manga') {
    if (settings.tagFilters.mangaShort && matchesTagFilter(anime, 'mangaShort')) return false
    if (settings.tagFilters.mangaMedium && matchesTagFilter(anime, 'mangaMedium')) return false
    if (settings.tagFilters.mangaFourPanel && matchesTagFilter(anime, 'mangaFourPanel')) return false
    if (settings.tagFilters.mangaNovelAdapted && matchesTagFilter(anime, 'mangaNovelAdapted')) return false
    if (settings.tagFilters.mangaCompleted && !matchesTagFilter(anime, 'mangaCompleted')) return false
  }
  if (anime.mediaKind === 'lightNovel') {
    if (settings.tagFilters.lightNovelWeb && matchesTagFilter(anime, 'lightNovelWeb')) return false
    if (settings.tagFilters.lightNovelCompleted && !matchesTagFilter(anime, 'lightNovelCompleted')) return false
  }
  return true
}

function filterSubjects(settings) {
  return (allSubjects.get(settings.mediaKind) ?? []).filter((anime) => {
    const year = yearOf(anime)
    const inYear = year === 0 || (year >= settings.yearMin && year <= settings.yearMax)
    if (anime.votes < settings.minVotes || !inYear) return false
    if (anime.score < settings.scoreMin || anime.score > settings.scoreMax) return false
    if (settings.mediaKind === 'galgame' && settings.galgameAudience === 'allAges' && anime.adult) return false
    if (settings.mediaKind === 'galgame' && settings.galgameAudience === 'adult' && !anime.adult) return false
    if (!matchesMediaTagFilters(anime, settings)) return false
    if (isExcluded(anime, settings)) return false
    if (settings.ranking === 'top500') return anime.rank !== null && anime.rank <= 500
    if (settings.ranking === 'top2000') return anime.rank !== null && anime.rank <= 2000
    if (settings.ranking === 'middle') return anime.rank !== null && anime.rank >= 1200 && anime.rank <= 4500
    if (settings.ranking === 'deep') return anime.rank !== null && anime.rank >= 4500
    return true
  })
}

function roomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  do {
    code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
  } while (rooms.has(code))
  return code
}

function playerId() {
  return globalThis.crypto.randomUUID()
}

function cleanNickname(value) {
  const nickname = String(value ?? '').trim().slice(0, 16)
  return nickname || '鉴分员'
}

function pickPair(pool) {
  if (pool.length < 2) return null
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const left = pool[Math.floor(Math.random() * pool.length)]
    const right = pool[Math.floor(Math.random() * pool.length)]
    if (left && right && left.id !== right.id && left.score !== right.score) return { left, right }
  }
  return null
}

function judge(pair, side) {
  const winningSide = pair.left.score > pair.right.score ? 'left' : 'right'
  return {
    correct: side === winningSide,
    winningSide,
    diff: Math.abs(pair.left.score - pair.right.score),
  }
}

function publicAnime(anime) {
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

function publicPair(pair, reveal = false) {
  if (!pair) return null
  const left = publicAnime(pair.left)
  const right = publicAnime(pair.right)
  if (!reveal) {
    delete left.score
    delete right.score
  }
  return { left, right }
}

function publicPlayers(room) {
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

function send(ws, message) {
  if (ws.readyState === undefined || ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
}

function findRoomFor(ws) {
  const client = clients.get(ws)
  return client?.roomCode ? rooms.get(client.roomCode) : null
}

function roomPayload(room, playerIdForClient) {
  const modeLength = room.mode === 'timed' ? room.timedSeconds : room.classicRounds
  return {
    code: room.code,
    youId: playerIdForClient,
    hostId: room.hostId,
    status: room.status,
    mode: room.mode,
    mediaKind: room.settings.mediaKind,
    length: modeLength,
    settings: room.settings,
    poolCount: room.poolCount,
    players: publicPlayers(room),
  }
}

function gamePayload(room, playerIdForClient) {
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
    pair: publicPair(pair, reveal && room.mode === 'classic'),
    selectedSide,
    reveal: room.mode === 'classic' && reveal ? room.reveal : player?.lastResult ?? null,
  }
}

function broadcastRoom(room) {
  for (const player of room.players.values()) {
    send(player.ws, { type: 'roomState', room: roomPayload(room, player.id) })
    const game = gamePayload(room, player.id)
    if (game) send(player.ws, { type: 'gameState', game })
  }
}

function updateRoomSettings(room, payload) {
  if (room.status !== 'lobby') return
  room.mode = sanitizeMode(payload.mode)
  room.settings = sanitizeSettings({ ...payload.settings, mediaKind: payload.mediaKind ?? payload.settings?.mediaKind })
  room.classicRounds = sanitizeLength('classic', payload.classicRounds ?? payload.length)
  room.timedSeconds = sanitizeLength('timed', payload.timedSeconds ?? payload.length)
  room.poolCount = filterSubjects(room.settings).length
}

function requireHost(ws, room) {
  const client = clients.get(ws)
  if (!client || client.playerId !== room.hostId) {
    send(ws, { type: 'error', message: '只有房主可以操作比赛设置。' })
    return false
  }
  return true
}

function attachPlayer(ws, room, nickname, isHost = false) {
  const id = playerId()
  const player = {
    id,
    ws,
    nickname: cleanNickname(nickname),
    score: 0,
    total: 0,
    streak: 0,
    pair: null,
    lastResult: null,
  }
  room.players.set(id, player)
  if (isHost) room.hostId = id
  clients.set(ws, { roomCode: room.code, playerId: id })
  return player
}

function createRoom(ws, payload) {
  const code = roomCode()
  const mode = sanitizeMode(payload.mode)
  const settings = sanitizeSettings({ ...payload.settings, mediaKind: payload.mediaKind ?? payload.settings?.mediaKind })
  const room = {
    code,
    hostId: '',
    status: 'lobby',
    mode,
    settings,
    classicRounds: sanitizeLength('classic', payload.classicRounds ?? payload.length),
    timedSeconds: sanitizeLength('timed', payload.timedSeconds ?? payload.length),
    poolCount: filterSubjects(settings).length,
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
  rooms.set(code, room)
  attachPlayer(ws, room, payload.nickname, true)
  broadcastRoom(room)
}

function joinRoom(ws, payload) {
  const code = String(payload.roomCode ?? '').trim().toUpperCase()
  const room = rooms.get(code)
  if (!room) {
    send(ws, { type: 'error', message: '没有找到这个房间。' })
    return
  }
  if (room.players.size >= maxPlayers) {
    send(ws, { type: 'error', message: '房间已满。' })
    return
  }
  if (room.status !== 'lobby') {
    send(ws, { type: 'error', message: '比赛已经开始，暂时不能加入。' })
    return
  }
  attachPlayer(ws, room, payload.nickname)
  broadcastRoom(room)
}

function startGame(ws) {
  const room = findRoomFor(ws)
  if (!room || !requireHost(ws, room)) return
  room.pool = filterSubjects(room.settings)
  if (!pickPair(room.pool)) {
    send(ws, { type: 'error', message: '当前筛选下题目不足，或评分都相同。' })
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
  clearTimeout(room.timer)
  clearTimeout(room.advanceTimer)
  if (room.mode === 'timed') {
    room.startAt = Date.now()
    room.durationMs = room.timedSeconds * 1000
    room.endsAt = room.startAt + room.durationMs
    for (const player of room.players.values()) player.pair = pickPair(room.pool)
    room.timer = setTimeout(() => endRoom(room, '时间到'), room.durationMs)
  } else {
    room.startAt = null
    room.durationMs = null
    room.endsAt = null
    room.pair = pickPair(room.pool)
  }
  broadcastRoom(room)
}

function nextClassicQuestion(room) {
  if (room.status !== 'reveal') return
  if (room.round >= room.classicRounds) {
    endRoom(room, '比赛结束')
    return
  }
  room.round += 1
  room.status = 'question'
  room.answers = new Map()
  room.reveal = null
  room.pair = pickPair(room.pool)
  if (!room.pair) {
    endRoom(room, '题库用完')
    return
  }
  broadcastRoom(room)
}

function endRoom(room, reason) {
  clearTimeout(room.timer)
  clearTimeout(room.advanceTimer)
  room.status = 'ended'
  room.reveal = room.reveal ?? { reason }
  broadcastRoom(room)
}

function returnToLobby(ws) {
  const room = findRoomFor(ws)
  if (!room || room.status !== 'ended') return
  clearTimeout(room.timer)
  clearTimeout(room.advanceTimer)
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
  broadcastRoom(room)
}

function answer(ws, payload) {
  const room = findRoomFor(ws)
  const client = clients.get(ws)
  const side = payload.side === 'right' ? 'right' : 'left'
  if (!room || !client || room.status !== 'question') return
  const player = room.players.get(client.playerId)
  if (!player) return
  if (room.mode === 'timed') {
    if (!room.endsAt || Date.now() >= room.endsAt || !player.pair) {
      endRoom(room, '时间到')
      return
    }
    const result = judge(player.pair, side)
    player.total += 1
    player.score += result.correct ? 1 : 0
    player.streak = result.correct ? player.streak + 1 : 0
    player.lastResult = { selectedSide: side, ...result, pair: publicPair(player.pair, true) }
    player.pair = pickPair(room.pool)
    room.round = Math.max(room.round, player.total + 1)
    send(player.ws, { type: 'gameState', game: gamePayload(room, player.id) })
    broadcastRoom(room)
    return
  }
  if (room.answers.has(player.id) || !room.pair) return
  const result = judge(room.pair, side)
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
      pair: publicPair(room.pair, true),
      answers: Object.fromEntries(room.answers),
      reason: '本题结算',
    }
    broadcastRoom(room)
    room.advanceTimer = setTimeout(() => nextClassicQuestion(room), 1500)
  } else {
    broadcastRoom(room)
  }
}

function updateNickname(ws, payload) {
  const room = findRoomFor(ws)
  const client = clients.get(ws)
  if (!room || !client) return
  const player = room.players.get(client.playerId)
  if (!player) return
  player.nickname = cleanNickname(payload.nickname)
  broadcastRoom(room)
}

function leave(ws) {
  const client = clients.get(ws)
  if (!client) return
  const room = rooms.get(client.roomCode)
  clients.delete(ws)
  if (!room) return
  room.players.delete(client.playerId)
  room.answers.delete(client.playerId)
  if (room.players.size === 0) {
    clearTimeout(room.timer)
    clearTimeout(room.advanceTimer)
    rooms.delete(room.code)
    return
  }
  if (room.hostId === client.playerId) room.hostId = room.players.keys().next().value
  broadcastRoom(room)
}

function handleRawMessage(ws, raw) {
  let payload
  try {
    payload = JSON.parse(typeof raw === 'string' ? raw : raw.toString())
  } catch {
    send(ws, { type: 'error', message: '消息格式不正确。' })
    return
  }
  const room = findRoomFor(ws)
  if (payload.type === 'createRoom') createRoom(ws, payload)
  else if (payload.type === 'joinRoom') joinRoom(ws, payload)
  else if (payload.type === 'updateSettings' && room && requireHost(ws, room)) {
    updateRoomSettings(room, payload)
    broadcastRoom(room)
  } else if (payload.type === 'startGame') startGame(ws)
  else if (payload.type === 'answer') answer(ws, payload)
  else if (payload.type === 'returnToLobby') returnToLobby(ws)
  else if (payload.type === 'updateNickname') updateNickname(ws, payload)
  else if (payload.type === 'leaveRoom') leave(ws)
}

export function createRoomWebSocketHandler() {
  return {
    onopen(ws) {
      send(ws, { type: 'connected' })
    },
    onmessage(ws, message, isBinary) {
      if (isBinary) return
      handleRawMessage(ws, message)
    },
    onclose(ws) {
      leave(ws)
    },
    onerror(ws, error) {
      console.error('[Room WebSocket] error:', error)
      leave(ws)
    },
  }
}

async function startLocalServer() {
  await loadSubjectSeeds()
  const server = createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ ok: true, rooms: rooms.size }))
      return
    }
    response.writeHead(404)
    response.end()
  })
  const wss = new WebSocketServer({ server })
  const handler = createRoomWebSocketHandler()
  wss.on('connection', (ws) => {
    handler.onopen(ws)
    ws.on('message', (raw, isBinary) => handler.onmessage(ws, raw, isBinary))
    ws.on('close', () => handler.onclose(ws))
    ws.on('error', (error) => handler.onerror(ws, error))
  })
  server.listen(port, host, () => {
    console.log(`Bangumi room server listening on ws://${host}:${port}`)
  })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startLocalServer().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
