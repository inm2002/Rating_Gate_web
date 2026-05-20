export type Mode = 'classic' | 'timed'
export type PresetName = 'standard' | 'akashi' | 'brahmin'
export type Side = 'left' | 'right'
export type RankingFilter = 'all' | 'top500' | 'top2000' | 'middle' | 'deep'
export type ExcludeKey = 'guochan' | 'movies' | 'ova' | 'pamen' | 'oumei' | 'short' | 'recap'

export interface Anime {
  id: number
  name: string
  nameCn: string
  score: number
  votes: number
  rank: number | null
  date: string
  image: string
  tags: string[]
  platform: string
}

export interface Stats {
  total: number
  correct: number
  streak: number
  bestStreak: number
}

export interface Settings {
  minVotes: number
  scoreMin: number
  scoreMax: number
  yearMin: number
  yearMax: number
  ranking: RankingFilter
  excludes: Record<ExcludeKey, boolean>
}

export interface AnswerResult {
  correct: boolean
  isTie: boolean
  winningSide: Side
  diff: number
}

export interface RoundPair {
  left: Anime
  right: Anime
  seen: Set<number>
}

export const MAX_LIVES = 5
export const TIME_LIMIT = 90
export const presetExcludeDefaults: ExcludeKey[] = ['guochan', 'movies', 'oumei', 'recap']

export function createDefaultSettings(year = new Date().getFullYear()): Settings {
  return {
    minVotes: 100,
    scoreMin: 0,
    scoreMax: 10,
    yearMin: 1900,
    yearMax: year,
    ranking: 'all',
    excludes: {
      guochan: true,
      movies: true,
      ova: false,
      pamen: false,
      oumei: true,
      short: false,
      recap: true,
    },
  }
}

export function titleOf(anime: Anime) {
  return anime.nameCn || anime.name
}

export function yearOf(anime: Anime) {
  const year = Number.parseInt(anime.date.slice(0, 4), 10)
  return Number.isFinite(year) ? year : 0
}

const excludeTerms: Record<ExcludeKey, string[]> = {
  guochan: ['国产', '国漫', '中国', '中国大陆', '大陆'],
  movies: ['剧场版', '劇場版', '剧场', '劇場', '映画'],
  ova: ['OVA', 'OAD'],
  pamen: ['泡面番', '泡面'],
  oumei: ['欧美', '美国', '英国', '法国', '加拿大', '欧洲'],
  short: ['短片', '短篇', 'Short'],
  recap: ['总集篇', '總集篇', '总集', '總集', 'Recap'],
}

function animeText(anime: Anime) {
  return `${anime.platform} ${anime.tags.join(' ')}`
}

function matchesAny(anime: Anime, terms: string[]) {
  const text = animeText(anime).toLowerCase()
  return terms.some((term) => text.includes(term.toLowerCase()))
}

export function isExcluded(anime: Anime, settings: Settings) {
  return (Object.keys(settings.excludes) as ExcludeKey[]).some(
    (key) => settings.excludes[key] && matchesAny(anime, excludeTerms[key]),
  )
}

export function filterAnime(allAnime: Anime[], settings: Settings) {
  const filtered = allAnime.filter((anime) => {
    const year = yearOf(anime)
    const inYear = year === 0 || (year >= settings.yearMin && year <= settings.yearMax)
    if (anime.votes < settings.minVotes || !inYear) return false
    if (anime.score < settings.scoreMin || anime.score > settings.scoreMax) return false
    if (isExcluded(anime, settings)) return false
    if (settings.ranking === 'top500') return anime.rank !== null && anime.rank <= 500
    if (settings.ranking === 'top2000') return anime.rank !== null && anime.rank <= 2000
    if (settings.ranking === 'middle') return anime.rank !== null && anime.rank >= 1200 && anime.rank <= 4500
    if (settings.ranking === 'deep') return anime.rank !== null && anime.rank >= 4500
    return true
  })
  return filtered.sort((a, b) => b.score - a.score)
}

export function hasDistinctScores(pool: Anime[]) {
  return new Set(pool.map((anime) => anime.score)).size >= 2
}

export function randomAnime(pool: Anime[], random = Math.random) {
  return pool[Math.floor(random() * pool.length)] ?? null
}

export function pickNextAnime(pool: Anime[], anchor: Anime, seen: Set<number>, random = Math.random) {
  let nextSeen = seen
  let candidates = pool.filter(
    (anime) => anime.id !== anchor.id && anime.score !== anchor.score && !nextSeen.has(anime.id),
  )
  if (candidates.length < 2) {
    nextSeen = new Set([anchor.id])
    candidates = pool.filter((anime) => anime.id !== anchor.id && anime.score !== anchor.score)
  }
  const close = candidates.filter((anime) => Math.abs(anime.score - anchor.score) <= 0.45)
  const medium = candidates.filter((anime) => Math.abs(anime.score - anchor.score) <= 0.9)
  const source = close.length > 2 && random() < 0.62 ? close : medium.length > 2 ? medium : candidates
  const anime = source[Math.floor(random() * source.length)] ?? null
  return anime ? { anime, seen: nextSeen } : null
}

export function createInitialRound(pool: Anime[], random = Math.random): RoundPair | null {
  if (pool.length < 2 || !hasDistinctScores(pool)) return null
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const left = randomAnime(pool, random)
    if (!left) break
    const seen = new Set([left.id])
    const next = pickNextAnime(pool, left, seen, random)
    if (next) {
      const nextSeen = new Set(next.seen)
      nextSeen.add(next.anime.id)
      return { left, right: next.anime, seen: nextSeen }
    }
  }
  return null
}

export function judgeAnswer(left: Anime, right: Anime, selectedSide: Side): AnswerResult {
  const isTie = left.score === right.score
  const winningSide = isTie ? selectedSide : left.score > right.score ? 'left' : 'right'
  const correct = isTie || selectedSide === winningSide
  return {
    correct,
    isTie,
    winningSide,
    diff: Math.abs(left.score - right.score),
  }
}

export function updateStats(stats: Stats, correct: boolean): Stats {
  const streak = correct ? stats.streak + 1 : 0
  return {
    total: stats.total + 1,
    correct: stats.correct + (correct ? 1 : 0),
    streak,
    bestStreak: Math.max(stats.bestStreak, streak),
  }
}

export function addDiffBucket(buckets: number[], diff: number) {
  const next = [...buckets]
  if (diff <= 0.2) next[0] = (next[0] ?? 0) + 1
  else if (diff <= 0.5) next[1] = (next[1] ?? 0) + 1
  else if (diff <= 1) next[2] = (next[2] ?? 0) + 1
  else next[3] = (next[3] ?? 0) + 1
  return next
}

export function applyPresetSettings(name: PresetName, year = new Date().getFullYear()): Settings {
  const settings = createDefaultSettings(year)
  if (name === 'akashi') {
    return { ...settings, scoreMax: 4.9 }
  }
  if (name === 'brahmin') {
    return { ...settings, yearMax: 2009, ranking: 'deep' }
  }
  return settings
}

function matchesPresetExcludes(settings: Settings) {
  return (Object.keys(settings.excludes) as ExcludeKey[]).every(
    (key) => settings.excludes[key] === presetExcludeDefaults.includes(key),
  )
}

export function detectPreset(settings: Settings, year = new Date().getFullYear()): PresetName | null {
  if (!matchesPresetExcludes(settings)) return null
  const base =
    settings.minVotes === 100 &&
    settings.scoreMin === 0 &&
    settings.yearMin === 1900 &&
    settings.ranking === 'all'
  if (base && settings.scoreMax === 10 && settings.yearMax === year) return 'standard'
  if (base && settings.scoreMax === 4.9 && settings.yearMax === year) return 'akashi'
  if (
    settings.minVotes === 100 &&
    settings.scoreMin === 0 &&
    settings.scoreMax === 10 &&
    settings.yearMin === 1900 &&
    settings.yearMax === 2009 &&
    settings.ranking === 'deep'
  ) {
    return 'brahmin'
  }
  return null
}
