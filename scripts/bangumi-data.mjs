const searchEndpoint = 'https://api.bgm.tv/v0/search/subjects'
const browseEndpoint = 'https://api.bgm.tv/v0/subjects'
const pageSize = 20
const sleepMs = 120

export const mediaKinds = ['anime', 'manga', 'lightNovel', 'galgame']

const rankWindows = [
  [1, 500],
  [501, 1000],
  [1001, 1500],
  [1501, 2000],
  [2001, 2500],
  [2501, 3000],
  [3001, 3500],
  [3501, 4000],
  [4001, 4500],
  [4501, 5000],
  [5001, 5500],
  [5501, 6000],
  [6001, 6500],
  [6501, 7000],
  [7001, 7500],
  [7501, 8000],
  [8001, 8500],
  [8501, 9000],
]

function searchQuery(label, sort, filter, maxPages = 25) {
  return { transport: 'search', label, sort, filter, maxPages }
}

function browseQuery(label, params, maxPages = 25) {
  return { transport: 'browse', label, params, maxPages }
}

export const mediaDefinitions = {
  anime: {
    label: '动画',
    outputBase: 'anime',
    subjectType: 2,
    minVotes: 100,
    queries: [
      ...rankWindows.map(([from, to]) =>
        searchQuery(`anime rank ${from}-${to}`, 'rank', {
          type: [2],
          nsfw: false,
          rank: [`>=${from}`, `<=${to}`],
        }),
      ),
      searchQuery('anime heat', 'heat', { type: [2], nsfw: false }),
      searchQuery('anime score', 'score', { type: [2], nsfw: false }),
      searchQuery('anime low heat', 'heat', { type: [2], nsfw: false, rating: ['<5'] }),
      searchQuery('anime low rank', 'rank', { type: [2], nsfw: false, rating: ['<5'] }),
      searchQuery('anime recent', 'heat', { type: [2], nsfw: false, date: ['>=2018-01-01'] }),
    ],
  },
  lightNovel: {
    label: '轻小说',
    outputBase: 'light-novel',
    subjectType: 1,
    minVotes: 50,
    queries: [browseQuery('light novel rank', { type: 1, cat: 1002, series: true, sort: 'rank' }, 80)],
  },
  manga: {
    label: '漫画',
    outputBase: 'manga',
    subjectType: 1,
    minVotes: 50,
    queries: [browseQuery('manga rank', { type: 1, cat: 1001, series: true, sort: 'rank' }, 80)],
  },
  galgame: {
    label: 'Galgame',
    outputBase: 'galgame',
    subjectType: 4,
    minVotes: 50,
    queries: [
      searchQuery('galgame rank', 'rank', { type: [4], meta_tags: ['Galgame'] }, 35),
      searchQuery('galgame heat', 'heat', { type: [4], meta_tags: ['Galgame'] }, 35),
      searchQuery('galgame score', 'score', { type: [4], meta_tags: ['Galgame'] }, 30),
      searchQuery('galgame low heat', 'heat', {
        type: [4],
        meta_tags: ['Galgame'],
        rating: ['<5'],
      }, 20),
    ],
  },
}

function wait(ms) {
  return new Promise((resolveTimer) => setTimeout(resolveTimer, ms))
}

function tagNames(item) {
  const tags = Array.isArray(item.tags) ? item.tags.map((tag) => tag.name).filter(Boolean) : []
  const metaTags = Array.isArray(item.meta_tags) ? item.meta_tags.filter(Boolean) : []
  return [...new Set([...metaTags, ...tags])]
}

function titleText(item) {
  return `${item.name_cn ?? ''} ${item.name ?? ''}`.toLowerCase()
}

function itemText(item) {
  return `${titleText(item)} ${tagNames(item).join(' ')}`.toLowerCase()
}

function includesTerm(text, terms) {
  return terms.some((term) => text.includes(term.toLowerCase()))
}

function hasLightNovelSignal(item) {
  const primaryTags = Array.isArray(item.tags) ? item.tags.slice(0, 6).map((tag) => tag.name).filter(Boolean) : []
  const text = `${titleText(item)} ${primaryTags.join(' ')}`.toLowerCase()
  return includesTerm(text, ['轻小说', 'ライトノベル', 'light novel', 'lightnovel'])
}

function hasGalgameSignal(item) {
  return tagNames(item).some((tag) => tag.toLowerCase() === 'galgame')
}

const adultTerms = ['r18', 'r-18', '18禁', '成人向', '成年向', 'hgame', 'エロゲ', 'eroge']

function isAdultGalgame(item) {
  if (item.nsfw) return true
  return includesTerm(itemText(item), adultTerms)
}

export function isCandidate(kind, item) {
  const definition = mediaDefinitions[kind]
  const score = Number(item.rating?.score ?? 0)
  const votes = Number(item.rating?.total ?? 0)
  const image = item.images?.common ?? item.images?.large ?? item.image ?? ''
  const canUseTitleCover = kind === 'galgame' && isAdultGalgame(item)
  if (!definition || item.type !== definition.subjectType || item.nsfw && kind !== 'galgame' || score <= 0) return false
  if (!image && !canUseTitleCover) return false
  if (votes < definition.minVotes) return false
  if (kind === 'manga') return Boolean(item.series)
  if (kind === 'lightNovel') return Boolean(item.series) && hasLightNovelSignal(item)
  if (kind === 'galgame') return hasGalgameSignal(item)
  return true
}

export function normalizeSubject(kind, item) {
  if (!isCandidate(kind, item)) return null
  const adult = kind === 'galgame' && isAdultGalgame(item)
  return {
    id: item.id,
    mediaKind: kind,
    name: item.name ?? '',
    nameCn: item.name_cn ?? '',
    score: Number(item.rating?.score ?? 0),
    votes: Number(item.rating?.total ?? 0),
    rank: item.rating?.rank ?? null,
    date: item.date ?? '',
    image: adult ? '' : item.images?.common ?? item.images?.large ?? item.image ?? '',
    tags: tagNames(item),
    platform: item.platform ?? '',
    adult,
  }
}

async function requestSearchPage(query, offset) {
  const response = await fetch(`${searchEndpoint}?limit=${pageSize}&offset=${offset}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'RatingGate/1.0 (Bangumi seed generator)',
    },
    body: JSON.stringify({
      keyword: '',
      sort: query.sort,
      filter: query.filter,
    }),
  })
  if (!response.ok) throw new Error(`${query.label}: HTTP ${response.status}`)
  return response.json()
}

async function requestBrowsePage(query, offset) {
  const params = new URLSearchParams({
    limit: String(pageSize),
    offset: String(offset),
  })
  for (const [key, value] of Object.entries(query.params)) params.set(key, String(value))
  const response = await fetch(`${browseEndpoint}?${params}`, {
    headers: {
      'User-Agent': 'RatingGate/1.0 (Bangumi seed generator)',
    },
  })
  if (!response.ok) throw new Error(`${query.label}: HTTP ${response.status}`)
  return response.json()
}

async function requestPage(query, offset) {
  return query.transport === 'browse' ? requestBrowsePage(query, offset) : requestSearchPage(query, offset)
}

export async function collectSubjects(kind, options = {}) {
  const definition = mediaDefinitions[kind]
  if (!definition) throw new Error(`Unknown media kind: ${kind}`)
  const byId = new Map()
  const audit = []

  for (const query of definition.queries) {
    let offset = 0
    let page = 0
    const maxPages = Math.min(query.maxPages, options.maxPagesPerQuery ?? query.maxPages)
    while (page < maxPages) {
      const payload = await requestPage(query, offset)
      const rows = Array.isArray(payload.data) ? payload.data : []
      const accepted = rows.map((item) => normalizeSubject(kind, item)).filter(Boolean)
      for (const row of accepted) byId.set(row.id, row)
      audit.push({
        label: query.label,
        page: page + 1,
        fetched: rows.length,
        accepted: accepted.length,
        uniqueAccepted: byId.size,
      })
      if (!options.quiet) {
        process.stdout.write(
          `\r${query.label.padEnd(22)} page ${String(page + 1).padStart(2)} collected ${String(byId.size).padStart(4)}`,
        )
      }
      offset += pageSize
      page += 1
      if (!rows.length || offset >= Number(payload.total ?? 0)) break
      await wait(options.sleepMs ?? sleepMs)
    }
    if (!options.quiet) process.stdout.write('\n')
    await wait((options.sleepMs ?? sleepMs) * 2)
  }

  const subjects = [...byId.values()].sort((a, b) => {
    if (a.rank && b.rank) return a.rank - b.rank
    if (a.rank) return -1
    if (b.rank) return 1
    return b.votes - a.votes
  })
  return { subjects, audit }
}

export function summarizeSubjects(subjects) {
  const scores = new Set(subjects.map((subject) => subject.score))
  const ranked = subjects.filter((subject) => subject.rank !== null)
  return {
    count: subjects.length,
    distinctScores: scores.size,
    ranked: ranked.length,
    rankRange: ranked.length
      ? [Math.min(...ranked.map((subject) => subject.rank)), Math.max(...ranked.map((subject) => subject.rank))]
      : [],
    voteRange: subjects.length
      ? [Math.min(...subjects.map((subject) => subject.votes)), Math.max(...subjects.map((subject) => subject.votes))]
      : [],
    sample: subjects
      .slice(0, 12)
      .map((subject) => ({
        id: subject.id,
        title: subject.nameCn || subject.name,
        score: subject.score,
        votes: subject.votes,
        rank: subject.rank,
        tags: subject.tags.slice(0, 6),
      })),
  }
}
