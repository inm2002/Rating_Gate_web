import './style.css'

type Mode = 'classic' | 'timed'
type Phase = 'loading' | 'playing' | 'reveal' | 'ended'
type Side = 'left' | 'right'

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
  yearMin: number
  yearMax: number
  ranking: 'all' | 'top' | 'mid'
  hideMovies: boolean
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
  minVotes: 800,
  yearMin: 1995,
  yearMax: new Date().getFullYear(),
  ranking: 'all',
  hideMovies: false,
}

app.innerHTML = `
  <main class="shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">A</span>
        <div>
          <h1>AniScore Arena</h1>
          <p>哪部动画在 Bangumi 上评分更高？</p>
        </div>
      </div>
      <div class="top-actions">
        <button class="ghost-button" id="mode-toggle" type="button">限时模式</button>
        <button class="primary-button" id="restart" type="button">重新开始</button>
      </div>
    </header>

    <section class="scoreboard" aria-label="游戏状态">
      <div class="metric"><span id="metric-lives">5</span><small>机会</small></div>
      <div class="metric"><span id="metric-streak">0</span><small>连击</small></div>
      <div class="metric"><span id="metric-total">0</span><small>已答</small></div>
      <div class="metric"><span id="metric-best">0</span><small>最佳</small></div>
    </section>

    <section class="stage" aria-live="polite">
      <p class="prompt" id="prompt">数据加载中...</p>
      <div class="arena">
        <button class="anime-card" id="card-left" type="button" aria-label="选择左侧动画">
          <span class="poster-wrap"><img id="image-left" alt="" /></span>
          <span class="card-copy">
            <strong id="title-left"></strong>
            <span id="meta-left"></span>
            <span class="score-line" id="score-left">?</span>
          </span>
          <span class="result-chip" id="chip-left"></span>
        </button>
        <div class="versus" aria-hidden="true">VS</div>
        <button class="anime-card" id="card-right" type="button" aria-label="选择右侧动画">
          <span class="poster-wrap"><img id="image-right" alt="" /></span>
          <span class="card-copy">
            <strong id="title-right"></strong>
            <span id="meta-right"></span>
            <span class="score-line" id="score-right">?</span>
          </span>
          <span class="result-chip" id="chip-right"></span>
        </button>
      </div>
    </section>

    <section class="control-deck" aria-label="筛选和说明">
      <div class="panel controls">
        <div class="panel-title">
          <h2>筛选题库</h2>
          <span id="pool-count">0 部</span>
        </div>
        <label>
          最低投票数
          <input id="min-votes" type="range" min="100" max="5000" step="100" value="800" />
          <output id="min-votes-label">800</output>
        </label>
        <div class="range-row">
          <label>
            起始年份
            <input id="year-min" type="number" min="1960" max="2030" value="1995" />
          </label>
          <label>
            结束年份
            <input id="year-max" type="number" min="1960" max="2030" value="${new Date().getFullYear()}" />
          </label>
        </div>
        <label>
          排名范围
          <select id="ranking">
            <option value="all">全部</option>
            <option value="top">高分前段</option>
            <option value="mid">中游混战</option>
          </select>
        </label>
        <label class="check-row">
          <input id="hide-movies" type="checkbox" />
          排除剧场版
        </label>
      </div>

      <div class="panel notes">
        <h2>本地原型</h2>
        <p>这是原创实现的单人评分竞猜 MVP，数据通过脚本从 Bangumi API 生成到本地 JSON。下一步可以在这个状态机外接 WebSocket 房间，实现多人同题竞速。</p>
        <dl>
          <div><dt>经典</dt><dd>5 次机会，答错扣机会。</dd></div>
          <div><dt>限时</dt><dd>90 秒冲分，答错不扣时间。</dd></div>
          <div><dt>快捷键</dt><dd>按 1 / 2 选择左右卡片。</dd></div>
        </dl>
      </div>
    </section>
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
  modeToggle: $('mode-toggle') as HTMLButtonElement,
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
  yearMin: $('year-min') as HTMLInputElement,
  yearMax: $('year-max') as HTMLInputElement,
  ranking: $('ranking') as HTMLSelectElement,
  hideMovies: $('hide-movies') as HTMLInputElement,
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

function applyFilters() {
  const filtered = allAnime.filter((anime) => {
    const year = yearOf(anime)
    const inYear = year === 0 || (year >= settings.yearMin && year <= settings.yearMax)
    const isMovie = anime.platform.includes('剧场') || anime.tags.includes('剧场版')
    if (anime.votes < settings.minVotes || !inYear) return false
    if (settings.hideMovies && isMovie) return false
    if (settings.ranking === 'top') return anime.rank !== null && anime.rank <= 500
    if (settings.ranking === 'mid') return anime.score >= 6.6 && anime.score <= 7.8
    return true
  })
  pool = filtered.sort((a, b) => b.score - a.score)
  byId.poolCount.textContent = `${pool.length} 部`
}

function randomAnime() {
  return pool[Math.floor(Math.random() * pool.length)] ?? null
}

function pickNext(anchor: Anime) {
  let candidates = pool.filter((anime) => anime.id !== anchor.id && !seen.has(anime.id))
  if (candidates.length < 2) {
    seen = new Set([anchor.id])
    candidates = pool.filter((anime) => anime.id !== anchor.id)
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
    if (selectedSide === side) view.root.classList.add('is-selected')
    if (winningSide === side || isTie) view.root.classList.add('is-winner')
    if (selectedSide === side && winningSide !== side && !isTie) view.root.classList.add('is-wrong')
    if (selectedSide === side) view.chip.textContent = winningSide === side || isTie ? '答对' : '答错'
    else if (winningSide === side) view.chip.textContent = '更高'
    else if (isTie) view.chip.textContent = '平分'
  }
}

function renderStats() {
  byId.metricLives.textContent = mode === 'timed' ? `${timeLeft}s` : `${lives}`
  byId.metricLives.nextElementSibling!.textContent = mode === 'timed' ? '时间' : '机会'
  byId.metricStreak.textContent = String(stats.streak)
  byId.metricTotal.textContent = String(stats.total)
  byId.metricBest.textContent = String(Math.max(getBest(mode), stats.correct))
  byId.modeToggle.textContent = mode === 'classic' ? '限时模式' : '经典模式'
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
  phase = pool.length >= 2 ? 'playing' : 'ended'
  left = randomAnime()
  if (left) {
    seen.add(left.id)
    right = pickNext(left)
    if (right) seen.add(right.id)
  }
  if (!left || !right) {
    setPrompt('当前筛选下题目不足，请放宽条件。', 'bad')
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
  settings = {
    minVotes: Number.parseInt(byId.minVotes.value, 10),
    yearMin: Number.parseInt(byId.yearMin.value, 10),
    yearMax: Number.parseInt(byId.yearMax.value, 10),
    ranking: byId.ranking.value as Settings['ranking'],
    hideMovies: byId.hideMovies.checked,
  }
  byId.minVotesLabel.textContent = String(settings.minVotes)
}

function bindEvents() {
  card('left').root.addEventListener('click', () => select('left'))
  card('right').root.addEventListener('click', () => select('right'))
  byId.restart.addEventListener('click', restartGame)
  byId.dialogRestart.addEventListener('click', restartGame)
  byId.modeToggle.addEventListener('click', () => {
    mode = mode === 'classic' ? 'timed' : 'classic'
    restartGame()
  })
  byId.copyResult.addEventListener('click', async () => {
    const text = `AniScore Arena：${mode === 'timed' ? '限时' : '经典'}模式答对 ${stats.correct}/${stats.total}，最高连击 ${stats.bestStreak}`
    await navigator.clipboard.writeText(text)
    byId.copyResult.textContent = '已复制'
    window.setTimeout(() => (byId.copyResult.textContent = '复制战绩'), 1200)
  })
  ;[byId.minVotes, byId.yearMin, byId.yearMax, byId.ranking, byId.hideMovies].forEach((control) => {
    control.addEventListener('change', () => {
      syncSettings()
      restartGame()
    })
    control.addEventListener('input', syncSettings)
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
