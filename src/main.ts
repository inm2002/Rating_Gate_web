import './style.css'

type Mode = 'classic' | 'timed'
type Phase = 'loading' | 'playing' | 'reveal' | 'ended'
type Side = 'left' | 'right'
type RankingFilter = 'all' | 'top500' | 'top2000' | 'middle' | 'deep'
type ExcludeKey = 'guochan' | 'movies' | 'ova' | 'pamen' | 'oumei' | 'short' | 'recap'

interface Anime {
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

interface Stats {
  total: number
  correct: number
  streak: number
  bestStreak: number
}

interface Settings {
  minVotes: number
  scoreMin: number
  scoreMax: number
  yearMin: number
  yearMax: number
  ranking: RankingFilter
  excludes: Record<ExcludeKey, boolean>
}

const MAX_LIVES = 5
const TIME_LIMIT = 90
const BEST_KEY = 'aniscore-arena-best-v1'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('Missing #app')

let allAnime: Anime[] = []
let pool: Anime[] = []
let seen = new Set<number>()
let mode: Mode = 'classic'
let phase: Phase = 'loading'
let left: Anime | null = null
let right: Anime | null = null
let firstRound = true
let selectedSide: Side | null = null
let winningSide: Side | null = null
let isTie = false
let lives = MAX_LIVES
let timeLeft = TIME_LIMIT
let timerId = 0
let revealId = 0
let stats: Stats = { total: 0, correct: 0, streak: 0, bestStreak: 0 }
let diffBuckets = [0, 0, 0, 0]
let settings: Settings = {
  minVotes: 100,
  scoreMin: 0,
  scoreMax: 10,
  yearMin: 1900,
  yearMax: new Date().getFullYear(),
  ranking: 'all',
  excludes: {
    guochan: false,
    movies: false,
    ova: false,
    pamen: false,
    oumei: false,
    short: false,
    recap: false,
  },
}

app.innerHTML = `
  <main class="shell">
    <header class="site-header">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">鉴</span>
        <div>
          <h1>目标是番组鉴分王</h1>
          <p>Bangumi 评分挑战</p>
        </div>
      </div>
      <div class="mode-switch" aria-label="游戏模式">
        <button id="mode-classic" type="button" aria-pressed="true">经典</button>
        <button id="mode-timed" type="button" aria-pressed="false">限时</button>
      </div>
    </header>

    <div class="game-layout">
      <section class="stage" aria-live="polite">
        <div class="stage-head">
          <div>
            <p class="prompt" id="prompt">数据加载中...</p>
            <span class="round-note" id="round-note">选择评分更高的一侧</span>
          </div>
          <button class="ghost-button" id="restart" type="button">重新开始</button>
        </div>
        <div class="arena">
          <button class="anime-card" id="card-left" type="button" aria-label="选择左侧动画">
            <span class="poster-wrap"><img id="image-left" alt="" /></span>
            <span class="card-copy">
              <span class="card-meta" id="meta-left"></span>
              <strong id="title-left"></strong>
              <span class="score-line" id="score-left">?</span>
            </span>
            <span class="result-chip" id="chip-left"></span>
          </button>
          <div class="versus" aria-hidden="true">VS</div>
          <button class="anime-card" id="card-right" type="button" aria-label="选择右侧动画">
            <span class="poster-wrap"><img id="image-right" alt="" /></span>
            <span class="card-copy">
              <span class="card-meta" id="meta-right"></span>
              <strong id="title-right"></strong>
              <span class="score-line" id="score-right">?</span>
            </span>
            <span class="result-chip" id="chip-right"></span>
          </button>
        </div>
      </section>

      <aside class="side-panel">
        <section class="scoreboard" aria-label="游戏状态">
          <div class="metric"><span id="metric-lives">5</span><small>机会</small></div>
          <div class="metric"><span id="metric-streak">0</span><small>连击</small></div>
          <div class="metric"><span id="metric-total">0</span><small>已答</small></div>
          <div class="metric"><span id="metric-best">0</span><small>最佳</small></div>
        </section>

        <section class="panel controls" aria-label="筛选题库">
          <div class="panel-title">
            <h2>筛选</h2>
            <span id="pool-count">0 部</span>
          </div>

          <div class="preset-row" aria-label="筛选预设">
            <button type="button" data-preset="standard">标准</button>
            <button type="button" data-preset="akashi">赤石大王</button>
            <button type="button" data-preset="brahmin">婆罗门</button>
          </div>

          <label class="control-field">
            <span>最低投票</span>
            <input id="min-votes" type="range" min="100" max="5000" step="100" value="100" />
            <output id="min-votes-label">100</output>
          </label>

          <div class="range-row">
            <label class="control-field">
              <span>最低评分</span>
              <input id="score-min" type="number" min="0" max="10" step="0.1" value="0" />
            </label>
            <label class="control-field">
              <span>最高评分</span>
              <input id="score-max" type="number" min="0" max="10" step="0.1" value="10" />
            </label>
          </div>

          <div class="range-row">
            <label class="control-field">
              <span>起始年份</span>
              <input id="year-min" type="number" min="1900" max="2030" value="1900" />
            </label>
            <label class="control-field">
              <span>结束年份</span>
              <input id="year-max" type="number" min="1900" max="2030" value="${new Date().getFullYear()}" />
            </label>
          </div>

          <label class="control-field">
            <span>排名范围</span>
            <select id="ranking">
              <option value="all">全部排名</option>
              <option value="top500">Top 500</option>
              <option value="top2000">Top 2000</option>
              <option value="middle">中游混战</option>
              <option value="deep">冷门区间</option>
            </select>
          </label>

          <fieldset class="exclude-set">
            <legend>排除</legend>
            <div class="toggle-grid">
              <label><input id="exclude-guochan" type="checkbox" /><span>国产</span></label>
              <label><input id="exclude-movies" type="checkbox" /><span>剧场版</span></label>
              <label><input id="exclude-ova" type="checkbox" /><span>OVA</span></label>
              <label><input id="exclude-pamen" type="checkbox" /><span>泡面番</span></label>
              <label><input id="exclude-oumei" type="checkbox" /><span>欧美</span></label>
              <label><input id="exclude-short" type="checkbox" /><span>短片</span></label>
              <label><input id="exclude-recap" type="checkbox" /><span>总集篇</span></label>
            </div>
          </fieldset>
        </section>
      </aside>
    </div>

    <footer class="site-footer">
      <span>数据来源 <a href="https://bangumi.tv/" target="_blank" rel="noopener">Bangumi</a></span>
      <span>参考来源 <a href="https://bangumi-master.logicry.cc/" target="_blank" rel="noopener">目标是Bangumi大师</a></span>
    </footer>
  </main>

  <dialog id="result-dialog" class="result-dialog">
    <div class="result-box">
      <p class="result-kicker" id="result-kicker">挑战结束</p>
      <h2 id="result-title">游戏结束</h2>
      <div class="result-grid">
        <span>答对</span><strong id="result-correct">0</strong>
        <span>已答</span><strong id="result-total">0</strong>
        <span>最高连击</span><strong id="result-streak">0</strong>
        <span>正确率</span><strong id="result-accuracy">0%</strong>
      </div>
      <div class="diff-bars" id="diff-bars"></div>
      <div class="dialog-actions">
        <button class="ghost-button" id="copy-result" type="button">复制战绩</button>
        <button class="primary-button" id="dialog-restart" type="button">再来一局</button>
      </div>
    </div>
  </dialog>
`

const $ = <T extends HTMLElement>(id: string) => {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing #${id}`)
  return node as T
}

const byId = {
  prompt: $('prompt'),
  roundNote: $('round-note'),
  modeClassic: $('mode-classic') as HTMLButtonElement,
  modeTimed: $('mode-timed') as HTMLButtonElement,
  restart: $('restart') as HTMLButtonElement,
  dialogRestart: $('dialog-restart') as HTMLButtonElement,
  copyResult: $('copy-result') as HTMLButtonElement,
  resultDialog: $('result-dialog') as HTMLDialogElement,
  metricLives: $('metric-lives'),
  metricStreak: $('metric-streak'),
  metricTotal: $('metric-total'),
  metricBest: $('metric-best'),
  poolCount: $('pool-count'),
  minVotes: $('min-votes') as HTMLInputElement,
  minVotesLabel: $('min-votes-label') as HTMLOutputElement,
  scoreMin: $('score-min') as HTMLInputElement,
  scoreMax: $('score-max') as HTMLInputElement,
  yearMin: $('year-min') as HTMLInputElement,
  yearMax: $('year-max') as HTMLInputElement,
  ranking: $('ranking') as HTMLSelectElement,
  excludes: {
    guochan: $('exclude-guochan') as HTMLInputElement,
    movies: $('exclude-movies') as HTMLInputElement,
    ova: $('exclude-ova') as HTMLInputElement,
    pamen: $('exclude-pamen') as HTMLInputElement,
    oumei: $('exclude-oumei') as HTMLInputElement,
    short: $('exclude-short') as HTMLInputElement,
    recap: $('exclude-recap') as HTMLInputElement,
  } satisfies Record<ExcludeKey, HTMLInputElement>,
}

function getBest(modeName: Mode) {
  const raw = localStorage.getItem(BEST_KEY)
  if (!raw) return 0
  const saved = JSON.parse(raw) as Partial<Record<Mode, number>>
  return saved[modeName] ?? 0
}

function setBest(modeName: Mode, value: number) {
  const raw = localStorage.getItem(BEST_KEY)
  const saved = raw ? (JSON.parse(raw) as Partial<Record<Mode, number>>) : {}
  saved[modeName] = Math.max(saved[modeName] ?? 0, value)
  localStorage.setItem(BEST_KEY, JSON.stringify(saved))
}

function titleOf(anime: Anime) {
  return anime.nameCn || anime.name
}

function yearOf(anime: Anime) {
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

function isExcluded(anime: Anime) {
  return (Object.keys(settings.excludes) as ExcludeKey[]).some(
    (key) => settings.excludes[key] && matchesAny(anime, excludeTerms[key]),
  )
}

function applyFilters() {
  const filtered = allAnime.filter((anime) => {
    const year = yearOf(anime)
    const inYear = year === 0 || (year >= settings.yearMin && year <= settings.yearMax)
    if (anime.votes < settings.minVotes || !inYear) return false
    if (anime.score < settings.scoreMin || anime.score > settings.scoreMax) return false
    if (isExcluded(anime)) return false
    if (settings.ranking === 'top500') return anime.rank !== null && anime.rank <= 500
    if (settings.ranking === 'top2000') return anime.rank !== null && anime.rank <= 2000
    if (settings.ranking === 'middle') return anime.rank !== null && anime.rank >= 1200 && anime.rank <= 4500
    if (settings.ranking === 'deep') return anime.rank !== null && anime.rank >= 4500
    return true
  })
  pool = filtered.sort((a, b) => b.score - a.score)
  byId.poolCount.textContent = `${pool.length} 部`
}

function randomAnime() {
  return pool[Math.floor(Math.random() * pool.length)] ?? null
}

function pickNext(anchor: Anime) {
  let candidates = pool.filter(
    (anime) => anime.id !== anchor.id && anime.score !== anchor.score && !seen.has(anime.id),
  )
  if (candidates.length < 2) {
    seen = new Set([anchor.id])
    candidates = pool.filter((anime) => anime.id !== anchor.id && anime.score !== anchor.score)
  }
  const close = candidates.filter((anime) => Math.abs(anime.score - anchor.score) <= 0.45)
  const medium = candidates.filter((anime) => Math.abs(anime.score - anchor.score) <= 0.9)
  const source = close.length > 2 && Math.random() < 0.62 ? close : medium.length > 2 ? medium : candidates
  return source[Math.floor(Math.random() * source.length)] ?? null
}

function setPrompt(text: string, tone: 'neutral' | 'good' | 'bad' = 'neutral') {
  byId.prompt.textContent = text
  byId.prompt.dataset.tone = tone
}

function card(side: Side) {
  return {
    root: $(`card-${side}`) as HTMLButtonElement,
    image: $(`image-${side}`) as HTMLImageElement,
    title: $(`title-${side}`),
    meta: $(`meta-${side}`),
    score: $(`score-${side}`),
    chip: $(`chip-${side}`),
  }
}

function renderCard(side: Side, anime: Anime | null) {
  const view = card(side)
  view.root.className = 'anime-card'
  view.chip.className = 'result-chip'
  view.chip.textContent = ''
  if (!anime) {
    view.root.disabled = true
    view.title.textContent = '暂无题目'
    view.meta.textContent = '请调整筛选条件'
    view.score.textContent = '-'
    view.image.removeAttribute('src')
    return
  }
  const shouldReveal = phase === 'reveal' || (side === 'left' && !firstRound)
  view.root.disabled = phase !== 'playing'
  view.image.src = anime.image
  view.image.alt = `${titleOf(anime)} 封面`
  view.title.textContent = titleOf(anime)
  view.meta.textContent = `${yearOf(anime) || '未知'} · ${anime.platform || '动画'} · ${anime.votes.toLocaleString()} votes`
  view.score.textContent = shouldReveal ? anime.score.toFixed(1) : '?'
  view.score.classList.toggle('hidden-score', !shouldReveal)

  if (phase === 'reveal') {
    const selectedCorrect = selectedSide === side && (winningSide === side || isTie)
    if (selectedSide === side) view.root.classList.add('is-selected')
    if (selectedCorrect) view.root.classList.add('is-correct')
    if (winningSide === side || isTie) view.root.classList.add('is-winner')
    if (selectedSide === side && winningSide !== side && !isTie) view.root.classList.add('is-wrong')
    if (selectedSide === side) {
      const correct = winningSide === side || isTie
      view.chip.textContent = correct ? '✓ 正确' : '✕ 错误'
      view.chip.classList.add(correct ? 'is-correct' : 'is-wrong')
    } else if (winningSide === side) {
      view.chip.textContent = '高分'
      view.chip.classList.add('is-winner')
    } else if (isTie) view.chip.textContent = '平分'
  }
}

function renderStats() {
  byId.metricLives.textContent = mode === 'timed' ? `${timeLeft}s` : `${lives}`
  byId.metricLives.nextElementSibling!.textContent = mode === 'timed' ? '时间' : '机会'
  byId.metricStreak.textContent = String(stats.streak)
  byId.metricTotal.textContent = String(stats.total)
  byId.metricBest.textContent = String(Math.max(getBest(mode), stats.correct))
  byId.modeClassic.setAttribute('aria-pressed', mode === 'classic' ? 'true' : 'false')
  byId.modeTimed.setAttribute('aria-pressed', mode === 'timed' ? 'true' : 'false')
  byId.roundNote.textContent = mode === 'timed' ? '90 秒冲分' : '5 次机会'
}

function render() {
  renderCard('left', left)
  renderCard('right', right)
  renderStats()
}

function startTimer() {
  window.clearInterval(timerId)
  if (mode !== 'timed') return
  timerId = window.setInterval(() => {
    timeLeft -= 1
    renderStats()
    if (timeLeft <= 0) endGame('时间到')
  }, 1000)
}

function stopTimer() {
  window.clearInterval(timerId)
}

function restartGame() {
  stopTimer()
  window.clearTimeout(revealId)
  applyFilters()
  lives = MAX_LIVES
  timeLeft = TIME_LIMIT
  stats = { total: 0, correct: 0, streak: 0, bestStreak: 0 }
  diffBuckets = [0, 0, 0, 0]
  seen = new Set()
  firstRound = true
  selectedSide = null
  winningSide = null
  isTie = false
  const distinctScores = new Set(pool.map((anime) => anime.score))
  phase = pool.length >= 2 && distinctScores.size >= 2 ? 'playing' : 'ended'
  left = null
  right = null
  for (let attempt = 0; attempt < 30 && phase === 'playing'; attempt += 1) {
    const candidate = randomAnime()
    if (!candidate) break
    seen = new Set([candidate.id])
    const next = pickNext(candidate)
    if (next) {
      left = candidate
      right = next
      seen.add(next.id)
      break
    }
  }
  if (!left || !right) {
    setPrompt('当前筛选下题目不足，或评分都相同，请放宽条件。', 'bad')
  } else {
    setPrompt('哪部动画评分更高？')
    startTimer()
  }
  byId.resultDialog.close()
  render()
}

function recordDiff(a: Anime, b: Anime) {
  const diff = Math.abs(a.score - b.score)
  if (diff <= 0.2) diffBuckets[0] += 1
  else if (diff <= 0.5) diffBuckets[1] += 1
  else if (diff <= 1) diffBuckets[2] += 1
  else diffBuckets[3] += 1
}

function select(side: Side) {
  if (phase !== 'playing' || !left || !right) return
  phase = 'reveal'
  selectedSide = side
  isTie = left.score === right.score
  winningSide = isTie ? side : left.score > right.score ? 'left' : 'right'
  const correct = isTie || selectedSide === winningSide
  stats.total += 1
  stats.streak = correct ? stats.streak + 1 : 0
  stats.bestStreak = Math.max(stats.bestStreak, stats.streak)
  if (correct) stats.correct += 1
  if (!correct && mode === 'classic') lives -= 1
  recordDiff(left, right)
  setPrompt(
    isTie
      ? `平分，都是 ${left.score.toFixed(1)} 分`
      : correct
        ? `答对，分差 ${Math.abs(left.score - right.score).toFixed(1)}`
        : `答错，分差 ${Math.abs(left.score - right.score).toFixed(1)}`,
    correct ? 'good' : 'bad',
  )
  render()
  if (mode === 'classic' && lives <= 0) {
    revealId = window.setTimeout(() => endGame('机会用尽'), 1100)
    return
  }
  revealId = window.setTimeout(advanceRound, 1150)
}

function advanceRound() {
  if (!right) return
  left = right
  seen.add(left.id)
  const next = pickNext(left)
  if (!next) {
    endGame('题库用完')
    return
  }
  right = next
  seen.add(next.id)
  phase = 'playing'
  firstRound = false
  selectedSide = null
  winningSide = null
  isTie = false
  setPrompt('哪部动画评分更高？')
  render()
}

function renderDiffBars() {
  const labels = ['0-0.2', '0.3-0.5', '0.6-1.0', '1.1+']
  const total = Math.max(1, diffBuckets.reduce((sum, value) => sum + value, 0))
  return labels
    .map((label, index) => {
      const value = diffBuckets[index] ?? 0
      const width = Math.max(4, Math.round((value / total) * 100))
      return `<div class="diff-row"><span>${label}</span><i style="width:${width}%"></i><b>${value}</b></div>`
    })
    .join('')
}

function endGame(reason: string) {
  if (phase === 'ended') return
  stopTimer()
  phase = 'ended'
  setBest(mode, stats.correct)
  const accuracy = stats.total ? Math.round((stats.correct / stats.total) * 100) : 0
  $('result-kicker').textContent = reason
  $('result-title').textContent =
    stats.correct >= 30 ? '你已经很接近评分雷达了' : stats.correct >= 15 ? '不错，手感在线' : '再熟一点就能起飞'
  $('result-correct').textContent = `${stats.correct} 题`
  $('result-total').textContent = `${stats.total} 题`
  $('result-streak').textContent = `${stats.bestStreak} 连`
  $('result-accuracy').textContent = `${accuracy}%`
  $('diff-bars').innerHTML = renderDiffBars()
  render()
  byId.resultDialog.showModal()
}

function syncSettings() {
  const scoreMin = Number.parseFloat(byId.scoreMin.value)
  const scoreMax = Number.parseFloat(byId.scoreMax.value)
  settings = {
    minVotes: Number.parseInt(byId.minVotes.value, 10),
    scoreMin: Number.isFinite(scoreMin) ? Math.max(0, Math.min(10, scoreMin)) : 0,
    scoreMax: Number.isFinite(scoreMax) ? Math.max(0, Math.min(10, scoreMax)) : 10,
    yearMin: Number.parseInt(byId.yearMin.value, 10),
    yearMax: Number.parseInt(byId.yearMax.value, 10),
    ranking: byId.ranking.value as RankingFilter,
    excludes: {
      guochan: byId.excludes.guochan.checked,
      movies: byId.excludes.movies.checked,
      ova: byId.excludes.ova.checked,
      pamen: byId.excludes.pamen.checked,
      oumei: byId.excludes.oumei.checked,
      short: byId.excludes.short.checked,
      recap: byId.excludes.recap.checked,
    },
  }
  if (settings.scoreMin > settings.scoreMax) {
    ;[settings.scoreMin, settings.scoreMax] = [settings.scoreMax, settings.scoreMin]
  }
  byId.scoreMin.value = settings.scoreMin.toFixed(1).replace('.0', '')
  byId.scoreMax.value = settings.scoreMax.toFixed(1).replace('.0', '')
  byId.minVotesLabel.textContent = String(settings.minVotes)
}

function applyPreset(name: string) {
  const year = new Date().getFullYear()
  Object.values(byId.excludes).forEach((input) => {
    input.checked = false
  })
  if (name === 'akashi') {
    byId.minVotes.value = '100'
    byId.scoreMin.value = '0'
    byId.scoreMax.value = '4.9'
    byId.yearMin.value = '1900'
    byId.yearMax.value = String(year)
    byId.ranking.value = 'all'
  } else if (name === 'brahmin') {
    byId.minVotes.value = '100'
    byId.scoreMin.value = '0'
    byId.scoreMax.value = '10'
    byId.yearMin.value = '1900'
    byId.yearMax.value = '2009'
    byId.ranking.value = 'deep'
  } else {
    byId.minVotes.value = '100'
    byId.scoreMin.value = '0'
    byId.scoreMax.value = '10'
    byId.yearMin.value = '1900'
    byId.yearMax.value = String(year)
    byId.ranking.value = 'all'
  }
  syncSettings()
  restartGame()
}

function bindEvents() {
  card('left').root.addEventListener('click', () => select('left'))
  card('right').root.addEventListener('click', () => select('right'))
  byId.restart.addEventListener('click', restartGame)
  byId.dialogRestart.addEventListener('click', restartGame)
  byId.modeClassic.addEventListener('click', () => {
    mode = 'classic'
    restartGame()
  })
  byId.modeTimed.addEventListener('click', () => {
    mode = 'timed'
    restartGame()
  })
  byId.copyResult.addEventListener('click', async () => {
    const text = `目标是番组鉴分王：${mode === 'timed' ? '限时' : '经典'}模式答对 ${stats.correct}/${stats.total}，最高连击 ${stats.bestStreak}`
    await navigator.clipboard.writeText(text)
    byId.copyResult.textContent = '已复制'
    window.setTimeout(() => (byId.copyResult.textContent = '复制战绩'), 1200)
  })
  ;[
    byId.minVotes,
    byId.scoreMin,
    byId.scoreMax,
    byId.yearMin,
    byId.yearMax,
    byId.ranking,
    ...Object.values(byId.excludes),
  ].forEach((control) => {
    control.addEventListener('change', () => {
      syncSettings()
      restartGame()
    })
    control.addEventListener('input', syncSettings)
  })
  document.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => applyPreset(button.dataset.preset ?? 'balanced'))
  })
  window.addEventListener('keydown', (event) => {
    if (event.key === '1') select('left')
    if (event.key === '2') select('right')
  })
}

async function boot() {
  bindEvents()
  try {
    const response = await fetch('/anime-seed.json')
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    allAnime = (await response.json()) as Anime[]
    syncSettings()
    restartGame()
  } catch (error) {
    console.error(error)
    setPrompt('未找到题库，请先运行 npm run data:seed。', 'bad')
    phase = 'ended'
    render()
  }
}

boot()
