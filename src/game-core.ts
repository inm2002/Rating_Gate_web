export type Mode = 'classic' | 'timed'
export type PresetName = 'standard' | 'akashi' | 'brahmin'
export type Side = 'left' | 'right'
export type RankingFilter = 'all' | 'top500' | 'top2000' | 'middle' | 'deep'
export type ExcludeKey = 'guochan' | 'movies' | 'ova' | 'pamen' | 'oumei' | 'short' | 'recap'
export type MediaTagFilterKey =
  | 'mangaShort'
  | 'mangaMedium'
  | 'mangaFourPanel'
  | 'mangaCompleted'
  | 'mangaNovelAdapted'
  | 'lightNovelWeb'
  | 'lightNovelCompleted'
export type MediaKind = 'anime' | 'manga' | 'lightNovel' | 'galgame'
export type GalgameAudience = 'all' | 'allAges' | 'adult'

export interface RatedSubject {
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

export interface Stats {
  total: number
  correct: number
  streak: number
  bestStreak: number
}

export interface Settings {
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

export interface AnswerResult {
  correct: boolean
  isTie: boolean
  winningSide: Side
  diff: number
}

export interface RoundPair {
  left: RatedSubject
  right: RatedSubject
  seen: Set<number>
}

export const MAX_LIVES = 5
export const TIME_LIMIT = 90
export const mediaKinds: MediaKind[] = ['anime', 'manga', 'lightNovel', 'galgame']
export const mediaLabels: Record<MediaKind, string> = {
  anime: '动画',
  manga: '漫画',
  lightNovel: '轻小说',
  galgame: 'Galgame',
}
export const mediaUnits: Record<MediaKind, string> = {
  anime: '部',
  manga: '部',
  lightNovel: '部',
  galgame: '部',
}
export const presetExcludeDefaults: ExcludeKey[] = ['guochan', 'movies', 'oumei', 'recap']

const emptyExcludes = {
  guochan: false,
  movies: false,
  ova: false,
  pamen: false,
  oumei: false,
  short: false,
  recap: false,
} satisfies Record<ExcludeKey, boolean>

export const mediaTagFilterKeys: MediaTagFilterKey[] = [
  'mangaShort',
  'mangaMedium',
  'mangaFourPanel',
  'mangaCompleted',
  'mangaNovelAdapted',
  'lightNovelWeb',
  'lightNovelCompleted',
]

const emptyTagFilters = Object.fromEntries(mediaTagFilterKeys.map((key) => [key, false])) as Record<
  MediaTagFilterKey,
  boolean
>

export function createDefaultSettings(mediaKind: MediaKind = 'anime', year = new Date().getFullYear()): Settings {
  return {
    mediaKind,
    minVotes: mediaKind === 'anime' ? 100 : 50,
    scoreMin: 0,
    scoreMax: 10,
    yearMin: 1900,
    yearMax: year,
    ranking: 'all',
    galgameAudience: 'all',
    tagFilters: { ...emptyTagFilters },
    excludes:
      mediaKind === 'anime'
        ? {
            ...emptyExcludes,
            guochan: true,
            movies: true,
            oumei: true,
            recap: true,
          }
        : { ...emptyExcludes },
  }
}

export function titleOf(subject: RatedSubject) {
  return subject.nameCn || subject.name
}

export function yearOf(subject: RatedSubject) {
  const year = Number.parseInt(subject.date.slice(0, 4), 10)
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

function subjectText(subject: RatedSubject) {
  return `${subject.platform} ${subject.tags.join(' ')}`
}

function matchesAny(subject: RatedSubject, terms: string[]) {
  const text = subjectText(subject).toLowerCase()
  return terms.some((term) => text.includes(term.toLowerCase()))
}

export function isExcluded(subject: RatedSubject, settings: Settings) {
  if (settings.mediaKind !== 'anime' || subject.mediaKind !== 'anime') return false
  return (Object.keys(settings.excludes) as ExcludeKey[]).some(
    (key) => settings.excludes[key] && matchesAny(subject, excludeTerms[key]),
  )
}

function hasTag(subject: RatedSubject, terms: string[]) {
  const tags = subject.tags.map((tag) => tag.toLowerCase())
  return terms.some((term) => tags.includes(term.toLowerCase()))
}

function matchesMediaTagFilters(subject: RatedSubject, settings: Settings) {
  if (subject.mediaKind === 'manga') {
    if (settings.tagFilters.mangaShort && matchesAny(subject, ['短篇'])) return false
    if (settings.tagFilters.mangaMedium && matchesAny(subject, ['中篇'])) return false
    if (settings.tagFilters.mangaFourPanel && matchesAny(subject, ['四格', '4格'])) return false
    if (settings.tagFilters.mangaNovelAdapted && matchesAny(subject, ['小说改', '小說改', '轻小说改', '輕小說改'])) {
      return false
    }
    if (settings.tagFilters.mangaCompleted && !hasTag(subject, ['已完结', '完结', '已完結', '完結'])) return false
  }
  if (subject.mediaKind === 'lightNovel') {
    if (
      settings.tagFilters.lightNovelWeb &&
      matchesAny(subject, ['web', 'web小说', 'web小說', '小説家になろう'])
    ) {
      return false
    }
    if (settings.tagFilters.lightNovelCompleted && !hasTag(subject, ['已完结', '完结', '已完結', '完結'])) return false
  }
  return true
}

export function filterSubjects(subjects: RatedSubject[], settings: Settings) {
  const filtered = subjects.filter((subject) => {
    const year = yearOf(subject)
    const inYear = year === 0 || (year >= settings.yearMin && year <= settings.yearMax)
    if (subject.mediaKind !== settings.mediaKind) return false
    if (subject.votes < settings.minVotes || !inYear) return false
    if (subject.score < settings.scoreMin || subject.score > settings.scoreMax) return false
    if (settings.mediaKind === 'galgame' && settings.galgameAudience === 'allAges' && subject.adult) return false
    if (settings.mediaKind === 'galgame' && settings.galgameAudience === 'adult' && !subject.adult) return false
    if (!matchesMediaTagFilters(subject, settings)) return false
    if (isExcluded(subject, settings)) return false
    if (settings.ranking === 'top500') return subject.rank !== null && subject.rank <= 500
    if (settings.ranking === 'top2000') return subject.rank !== null && subject.rank <= 2000
    if (settings.ranking === 'middle') return subject.rank !== null && subject.rank >= 1200 && subject.rank <= 4500
    if (settings.ranking === 'deep') return subject.rank !== null && subject.rank >= 4500
    return true
  })
  return filtered.sort((a, b) => b.score - a.score)
}

export function hasDistinctScores(pool: RatedSubject[]) {
  return new Set(pool.map((subject) => subject.score)).size >= 2
}

export function randomSubject(pool: RatedSubject[], random = Math.random) {
  return pool[Math.floor(random() * pool.length)] ?? null
}

export function pickNextSubject(
  pool: RatedSubject[],
  anchor: RatedSubject,
  seen: Set<number>,
  random = Math.random,
) {
  let nextSeen = seen
  let candidates = pool.filter(
    (subject) => subject.id !== anchor.id && subject.score !== anchor.score && !nextSeen.has(subject.id),
  )
  if (candidates.length < 2) {
    nextSeen = new Set([anchor.id])
    candidates = pool.filter((subject) => subject.id !== anchor.id && subject.score !== anchor.score)
  }
  const close = candidates.filter((subject) => Math.abs(subject.score - anchor.score) <= 0.45)
  const medium = candidates.filter((subject) => Math.abs(subject.score - anchor.score) <= 0.9)
  const source = close.length > 2 && random() < 0.62 ? close : medium.length > 2 ? medium : candidates
  const subject = source[Math.floor(random() * source.length)] ?? null
  return subject ? { subject, seen: nextSeen } : null
}

export function createInitialRound(pool: RatedSubject[], random = Math.random): RoundPair | null {
  if (pool.length < 2 || !hasDistinctScores(pool)) return null
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const left = randomSubject(pool, random)
    if (!left) break
    const seen = new Set([left.id])
    const next = pickNextSubject(pool, left, seen, random)
    if (next) {
      const nextSeen = new Set(next.seen)
      nextSeen.add(next.subject.id)
      return { left, right: next.subject, seen: nextSeen }
    }
  }
  return null
}

export function judgeAnswer(left: RatedSubject, right: RatedSubject, selectedSide: Side): AnswerResult {
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

export function applyPresetSettings(
  name: PresetName,
  mediaKind: MediaKind = 'anime',
  year = new Date().getFullYear(),
): Settings {
  const settings = createDefaultSettings(mediaKind, year)
  if (name === 'akashi') {
    return { ...settings, scoreMax: 4.9 }
  }
  if (name === 'brahmin') {
    return { ...settings, yearMax: 2009, ranking: 'deep' }
  }
  return settings
}

function matchesPresetExcludes(settings: Settings) {
  const defaults = createDefaultSettings(settings.mediaKind).excludes
  return (Object.keys(settings.excludes) as ExcludeKey[]).every((key) => settings.excludes[key] === defaults[key])
}

export function detectPreset(settings: Settings, year = new Date().getFullYear()): PresetName | null {
  if (settings.mediaKind !== 'anime') return null
  if (!matchesPresetExcludes(settings)) return null
  if (mediaTagFilterKeys.some((key) => settings.tagFilters[key])) return null
  const base =
    settings.minVotes === createDefaultSettings(settings.mediaKind, year).minVotes &&
    settings.scoreMin === 0 &&
    settings.yearMin === 1900 &&
    settings.ranking === 'all' &&
    settings.galgameAudience === 'all'
  if (base && settings.scoreMax === 10 && settings.yearMax === year) return 'standard'
  if (base && settings.scoreMax === 4.9 && settings.yearMax === year) return 'akashi'
  if (
    settings.minVotes === createDefaultSettings(settings.mediaKind, year).minVotes &&
    settings.scoreMin === 0 &&
    settings.scoreMax === 10 &&
    settings.yearMin === 1900 &&
    settings.yearMax === 2009 &&
    settings.ranking === 'deep' &&
    settings.galgameAudience === 'all'
  ) {
    return 'brahmin'
  }
  return null
}
