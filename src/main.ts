import './style.css'

import {
  MAX_LIVES,
  TIME_LIMIT,
  addDiffBucket,
  applyPresetSettings,
  createDefaultSettings,
  createInitialRound,
  detectPreset,
  filterAnime,
  judgeAnswer,
  pickNextAnime,
  titleOf,
  updateStats,
  yearOf,
  type Anime,
  type ExcludeKey,
  type Mode,
  type PresetName,
  type RankingFilter,
  type Settings,
  type Side,
  type Stats,
} from './game-core'

type AppView = 'solo' | 'multiplayer'
type Phase = 'loading' | 'ready' | 'playing' | 'reveal' | 'ended'

interface AnimeSeedMeta {
  generatedAt: string
  source: string
  count: number
}

interface LocalRoom {
  code: string
  nickname: string
  role: '房主' | '玩家'
}

const BEST_KEY = 'aniscore-arena-best-v1'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('Missing #app')

let allAnime: Anime[] = []
let dataUpdatedAt = ''
let pool: Anime[] = []
let seen = new Set<number>()
let appView: AppView = 'solo'
let localRoom: LocalRoom | null = null
let mode: Mode = 'classic'
let roomMode: Mode = 'classic'
let roomClassicRounds = 10
let roomTimedSeconds = 90
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
let activePreset: PresetName | null = 'standard'
let activeRoomPreset: PresetName | null = 'standard'
let settings: Settings = createDefaultSettings()
let roomSettings: Settings = createDefaultSettings()

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
      <div class="header-actions">
        <div class="view-switch" aria-label="玩法入口">
          <button id="view-solo" type="button" aria-pressed="true">单人挑战</button>
          <button id="view-multiplayer" type="button" aria-pressed="false">多人房间</button>
        </div>
        <div class="mode-switch" id="solo-mode-switch" aria-label="游戏模式">
          <button id="mode-classic" type="button" aria-pressed="true">经典</button>
          <button id="mode-timed" type="button" aria-pressed="false">限时</button>
        </div>
      </div>
    </header>

    <div class="game-layout" id="solo-view">
      <section class="stage" aria-live="polite">
        <div class="stage-head">
          <div>
            <p class="prompt" id="prompt">数据加载中...</p>
            <span class="round-note" id="round-note">胜者进入下一轮，左侧会显示上一轮胜者的评分。</span>
          </div>
          <button class="ghost-button" id="restart" type="button">重新开始</button>
        </div>
        <div class="arena">
          <button class="anime-card" id="card-left" type="button" aria-label="选择左侧动画">
            <span class="poster-wrap" id="poster-left" data-loading="true">
              <span class="poster-fallback" id="poster-fallback-left">封面加载中</span>
              <img id="image-left" alt="" />
            </span>
            <span class="card-copy">
              <span class="card-meta" id="meta-left"></span>
              <strong id="title-left"></strong>
              <span class="score-line" id="score-left">?</span>
            </span>
            <span class="result-chip" id="chip-left"></span>
          </button>
          <div class="versus" aria-hidden="true">VS</div>
          <button class="anime-card" id="card-right" type="button" aria-label="选择右侧动画">
            <span class="poster-wrap" id="poster-right" data-loading="true">
              <span class="poster-fallback" id="poster-fallback-right">封面加载中</span>
              <img id="image-right" alt="" />
            </span>
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
              <label><input id="exclude-guochan" type="checkbox" checked /><span>国产</span></label>
              <label><input id="exclude-movies" type="checkbox" checked /><span>剧场版</span></label>
              <label><input id="exclude-ova" type="checkbox" /><span>OVA</span></label>
              <label><input id="exclude-pamen" type="checkbox" /><span>泡面番</span></label>
              <label><input id="exclude-oumei" type="checkbox" checked /><span>欧美</span></label>
              <label><input id="exclude-short" type="checkbox" /><span>短片</span></label>
              <label><input id="exclude-recap" type="checkbox" checked /><span>总集篇</span></label>
            </div>
          </fieldset>
        </section>
      </aside>
    </div>

    <section class="multiplayer-view" id="multiplayer-view" hidden>
      <div class="room-card room-entry">
        <div class="room-heading">
          <div>
            <p class="eyebrow">多人模式</p>
            <h2>创建或加入房间</h2>
          </div>
          <span class="room-state" id="room-entry-state">本地预览</span>
        </div>

        <div class="room-form-grid">
          <label class="control-field">
            <span>昵称</span>
            <input id="player-name" type="text" maxlength="16" value="鉴分员" autocomplete="nickname" />
          </label>
          <label class="control-field">
            <span>房间码</span>
            <input id="room-code-input" type="text" maxlength="6" placeholder="例如 A7K2Q9" autocomplete="off" />
          </label>
        </div>

        <div class="room-actions">
          <button class="primary-button" id="create-room" type="button">创建房间</button>
          <button class="ghost-button" id="join-room" type="button">加入房间</button>
        </div>
        <p class="room-message" id="room-message">房间界面已就绪，下一步接入本地 WebSocket 服务。</p>
      </div>

      <div class="room-card room-lobby" id="room-lobby" hidden>
        <div class="room-heading">
          <div>
            <p class="eyebrow" id="room-role">房主</p>
            <h2>房间大厅</h2>
          </div>
          <span class="room-state" id="room-status">等待玩家</span>
        </div>

        <div class="room-code-bar">
          <label class="control-field">
            <span>房间码</span>
            <input id="room-code-display" type="text" value="------" readonly />
          </label>
          <button class="ghost-button" id="copy-room-code" type="button">复制</button>
        </div>

        <div class="lobby-grid">
          <section class="lobby-panel">
            <div class="panel-title compact-title">
              <h3>玩家</h3>
              <span id="room-player-count">1/8</span>
            </div>
            <div class="player-list" id="room-player-list"></div>
          </section>

          <section class="lobby-panel">
            <div class="panel-title compact-title">
              <h3>比赛设置</h3>
              <span id="room-mode-label">经典</span>
            </div>
            <div class="room-mode-switch" aria-label="房间比赛模式">
              <button id="room-mode-classic" type="button" aria-pressed="true">经典同步</button>
              <button id="room-mode-timed" type="button" aria-pressed="false">限时冲分</button>
            </div>
            <p class="room-mode-note" id="room-mode-note">经典模式：全员同题作答，等待所有人完成后进入下一题。</p>

            <label class="control-field">
              <span id="room-length-label">比赛题数</span>
              <input id="room-length-input" type="number" min="1" max="50" step="1" value="10" />
            </label>

            <div class="room-preset-row" aria-label="房间筛选预设">
              <button type="button" data-room-preset="standard">标准</button>
              <button type="button" data-room-preset="akashi">赤石大王</button>
              <button type="button" data-room-preset="brahmin">婆罗门</button>
            </div>

            <label class="control-field">
              <span>最低投票</span>
              <input id="room-min-votes" type="range" min="100" max="5000" step="100" value="100" />
              <output id="room-min-votes-label">100</output>
            </label>

            <div class="range-row">
              <label class="control-field">
                <span>最低评分</span>
                <input id="room-score-min" type="number" min="0" max="10" step="0.1" value="0" />
              </label>
              <label class="control-field">
                <span>最高评分</span>
                <input id="room-score-max" type="number" min="0" max="10" step="0.1" value="10" />
              </label>
            </div>

            <div class="range-row">
              <label class="control-field">
                <span>起始年份</span>
                <input id="room-year-min" type="number" min="1900" max="2030" value="1900" />
              </label>
              <label class="control-field">
                <span>结束年份</span>
                <input id="room-year-max" type="number" min="1900" max="2030" value="${new Date().getFullYear()}" />
              </label>
            </div>

            <label class="control-field">
              <span>排名范围</span>
              <select id="room-ranking">
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
                <label><input id="room-exclude-guochan" type="checkbox" checked /><span>国产</span></label>
                <label><input id="room-exclude-movies" type="checkbox" checked /><span>剧场版</span></label>
                <label><input id="room-exclude-ova" type="checkbox" /><span>OVA</span></label>
                <label><input id="room-exclude-pamen" type="checkbox" /><span>泡面番</span></label>
                <label><input id="room-exclude-oumei" type="checkbox" checked /><span>欧美</span></label>
                <label><input id="room-exclude-short" type="checkbox" /><span>短片</span></label>
                <label><input id="room-exclude-recap" type="checkbox" checked /><span>总集篇</span></label>
              </div>
            </fieldset>

            <dl class="room-settings">
              <div><dt>可用题库</dt><dd id="room-pool">-- 部</dd></div>
              <div><dt>比赛长度</dt><dd id="room-length">10 题</dd></div>
            </dl>
          </section>
        </div>

        <div class="room-actions">
          <button class="primary-button" id="room-start" type="button" disabled>开始比赛</button>
          <button class="ghost-button" id="leave-room" type="button">离开房间</button>
        </div>
      </div>

      <div class="room-card room-guide">
        <p class="eyebrow">房间流程</p>
        <ol>
          <li><span>1</span><b>房主创建房间并复制房间码</b></li>
          <li><span>2</span><b>玩家用房间码加入同一大厅</b></li>
          <li><span>3</span><b>房主确认设置后统一开始比赛</b></li>
        </ol>
      </div>
    </section>

    <footer class="site-footer">
      <span>数据来源 <a href="https://bangumi.tv/" target="_blank" rel="noopener">Bangumi</a></span>
      <span>参考来源 <a href="https://bangumi-master.logicry.cc/" target="_blank" rel="noopener">目标是Bangumi大师</a></span>
      <span id="data-updated">数据更新时间 --</span>
    </footer>
  </main>

  <dialog id="timed-ready-dialog" class="result-dialog timed-ready-dialog">
    <div class="result-box">
      <p class="result-kicker">限时挑战</p>
      <h2>准备好再开始</h2>
      <p class="dialog-copy">点击开始后计时才会启动，90 秒内尽可能判断更多评分高低。</p>
      <div class="dialog-actions">
        <button class="ghost-button" id="timed-back-classic" type="button">回到经典</button>
        <button class="primary-button" id="timed-start" type="button">开始计时</button>
      </div>
    </div>
  </dialog>

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

  <div id="toast" class="toast" hidden role="status" aria-live="polite">
    <span id="toast-message"></span>
    <button id="toast-close" type="button" aria-label="关闭提示">×</button>
  </div>
`

const $ = <T extends HTMLElement>(id: string) => {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing #${id}`)
  return node as T
}

const byId = {
  prompt: $('prompt'),
  roundNote: $('round-note'),
  viewSolo: $('view-solo') as HTMLButtonElement,
  viewMultiplayer: $('view-multiplayer') as HTMLButtonElement,
  soloView: $('solo-view'),
  multiplayerView: $('multiplayer-view'),
  soloModeSwitch: $('solo-mode-switch'),
  modeClassic: $('mode-classic') as HTMLButtonElement,
  modeTimed: $('mode-timed') as HTMLButtonElement,
  restart: $('restart') as HTMLButtonElement,
  dialogRestart: $('dialog-restart') as HTMLButtonElement,
  copyResult: $('copy-result') as HTMLButtonElement,
  resultDialog: $('result-dialog') as HTMLDialogElement,
  timedReadyDialog: $('timed-ready-dialog') as HTMLDialogElement,
  timedBackClassic: $('timed-back-classic') as HTMLButtonElement,
  timedStart: $('timed-start') as HTMLButtonElement,
  dataUpdated: $('data-updated'),
  presetButtons: [...document.querySelectorAll<HTMLButtonElement>('[data-preset]')],
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
  playerName: $('player-name') as HTMLInputElement,
  roomCodeInput: $('room-code-input') as HTMLInputElement,
  createRoom: $('create-room') as HTMLButtonElement,
  joinRoom: $('join-room') as HTMLButtonElement,
  roomMessage: $('room-message'),
  roomLobby: $('room-lobby'),
  roomRole: $('room-role'),
  roomCodeDisplay: $('room-code-display') as HTMLInputElement,
  copyRoomCode: $('copy-room-code') as HTMLButtonElement,
  roomStatus: $('room-status'),
  roomModeLabel: $('room-mode-label'),
  roomModeClassic: $('room-mode-classic') as HTMLButtonElement,
  roomModeTimed: $('room-mode-timed') as HTMLButtonElement,
  roomModeNote: $('room-mode-note'),
  roomLengthLabel: $('room-length-label'),
  roomLengthInput: $('room-length-input') as HTMLInputElement,
  roomPresetButtons: [...document.querySelectorAll<HTMLButtonElement>('[data-room-preset]')],
  roomMinVotes: $('room-min-votes') as HTMLInputElement,
  roomMinVotesLabel: $('room-min-votes-label') as HTMLOutputElement,
  roomScoreMin: $('room-score-min') as HTMLInputElement,
  roomScoreMax: $('room-score-max') as HTMLInputElement,
  roomYearMin: $('room-year-min') as HTMLInputElement,
  roomYearMax: $('room-year-max') as HTMLInputElement,
  roomRanking: $('room-ranking') as HTMLSelectElement,
  roomPool: $('room-pool'),
  roomLength: $('room-length'),
  roomPlayerCount: $('room-player-count'),
  roomPlayerList: $('room-player-list'),
  roomStart: $('room-start') as HTMLButtonElement,
  leaveRoom: $('leave-room') as HTMLButtonElement,
  toast: $('toast'),
  toastMessage: $('toast-message'),
  toastClose: $('toast-close') as HTMLButtonElement,
  roomExcludes: {
    guochan: $('room-exclude-guochan') as HTMLInputElement,
    movies: $('room-exclude-movies') as HTMLInputElement,
    ova: $('room-exclude-ova') as HTMLInputElement,
    pamen: $('room-exclude-pamen') as HTMLInputElement,
    oumei: $('room-exclude-oumei') as HTMLInputElement,
    short: $('room-exclude-short') as HTMLInputElement,
    recap: $('room-exclude-recap') as HTMLInputElement,
  } satisfies Record<ExcludeKey, HTMLInputElement>,
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

function formatUpdatedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function applyFilters() {
  pool = filterAnime(allAnime, settings)
  byId.poolCount.textContent = `${pool.length} 部`
  renderRoomSettings()
}

function setPrompt(text: string, tone: 'neutral' | 'good' | 'bad' = 'neutral') {
  byId.prompt.textContent = text
  byId.prompt.dataset.tone = tone
}

let toastTimer = 0

function showToast(message: string) {
  window.clearTimeout(toastTimer)
  byId.toastMessage.textContent = message
  byId.toast.hidden = false
  toastTimer = window.setTimeout(() => {
    byId.toast.hidden = true
  }, 2600)
}

function closeToast() {
  window.clearTimeout(toastTimer)
  byId.toast.hidden = true
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return entities[char] ?? char
  })
}

function renderAppView() {
  const isSolo = appView === 'solo'
  byId.soloView.hidden = !isSolo
  byId.multiplayerView.hidden = isSolo
  byId.soloModeSwitch.hidden = !isSolo
  byId.viewSolo.setAttribute('aria-pressed', isSolo ? 'true' : 'false')
  byId.viewMultiplayer.setAttribute('aria-pressed', isSolo ? 'false' : 'true')
}

function switchView(nextView: AppView) {
  appView = nextView
  if (nextView === 'multiplayer') {
    stopTimer()
    if (byId.timedReadyDialog.open) byId.timedReadyDialog.close()
  }
  renderAppView()
  renderRoom()
}

function normalizeRoomCode(value: string) {
  return value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6)
}

function generateRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return code
}

function currentNickname() {
  return byId.playerName.value.trim().slice(0, 16) || '鉴分员'
}

function renderRoom() {
  byId.roomLobby.hidden = !localRoom
  renderRoomSettings()
  if (!localRoom) {
    byId.roomCodeDisplay.value = '------'
    byId.roomMessage.textContent = '房间界面已就绪，下一步接入本地 WebSocket 服务。'
    return
  }
  byId.roomCodeDisplay.value = localRoom.code
  byId.roomRole.textContent = localRoom.role
  byId.roomStatus.textContent = localRoom.role === '房主' ? '等待玩家' : '已加入'
  byId.roomMessage.textContent =
    localRoom.role === '房主' ? `房间 ${localRoom.code} 已创建。` : `已加入房间 ${localRoom.code}。`
  byId.roomPlayerCount.textContent = localRoom.role === '房主' ? '1/8' : '2/8'
  const waitingRow =
    localRoom.role === '房主'
      ? '<div class="player-row is-empty"><span>等待玩家加入</span><b>空位</b></div>'
      : '<div class="player-row"><span>房主</span><b>0 分</b></div>'
  byId.roomPlayerList.innerHTML = `
    <div class="player-row is-you"><span>${escapeHtml(localRoom.nickname)}</span><b>${localRoom.role}</b></div>
    ${waitingRow}
  `
}

function setRoomControlsFromSettings(nextSettings: Settings) {
  byId.roomMinVotes.value = String(nextSettings.minVotes)
  byId.roomScoreMin.value = String(nextSettings.scoreMin)
  byId.roomScoreMax.value = String(nextSettings.scoreMax)
  byId.roomYearMin.value = String(nextSettings.yearMin)
  byId.roomYearMax.value = String(nextSettings.yearMax)
  byId.roomRanking.value = nextSettings.ranking
  ;(Object.keys(byId.roomExcludes) as ExcludeKey[]).forEach((key) => {
    byId.roomExcludes[key].checked = nextSettings.excludes[key]
  })
}

function syncRoomSettings() {
  const scoreMin = Number.parseFloat(byId.roomScoreMin.value)
  const scoreMax = Number.parseFloat(byId.roomScoreMax.value)
  roomSettings = {
    minVotes: Number.parseInt(byId.roomMinVotes.value, 10),
    scoreMin: Number.isFinite(scoreMin) ? Math.max(0, Math.min(10, scoreMin)) : 0,
    scoreMax: Number.isFinite(scoreMax) ? Math.max(0, Math.min(10, scoreMax)) : 10,
    yearMin: Number.parseInt(byId.roomYearMin.value, 10),
    yearMax: Number.parseInt(byId.roomYearMax.value, 10),
    ranking: byId.roomRanking.value as RankingFilter,
    excludes: {
      guochan: byId.roomExcludes.guochan.checked,
      movies: byId.roomExcludes.movies.checked,
      ova: byId.roomExcludes.ova.checked,
      pamen: byId.roomExcludes.pamen.checked,
      oumei: byId.roomExcludes.oumei.checked,
      short: byId.roomExcludes.short.checked,
      recap: byId.roomExcludes.recap.checked,
    },
  }
  if (roomSettings.scoreMin > roomSettings.scoreMax) {
    ;[roomSettings.scoreMin, roomSettings.scoreMax] = [roomSettings.scoreMax, roomSettings.scoreMin]
  }
  byId.roomScoreMin.value = roomSettings.scoreMin.toFixed(1).replace('.0', '')
  byId.roomScoreMax.value = roomSettings.scoreMax.toFixed(1).replace('.0', '')
  byId.roomMinVotesLabel.textContent = String(roomSettings.minVotes)
  activeRoomPreset = detectPreset(roomSettings)
  renderRoomSettings()
}

function syncRoomLength() {
  const raw = Number.parseInt(byId.roomLengthInput.value, 10)
  if (roomMode === 'classic') {
    roomClassicRounds = Number.isFinite(raw) ? Math.max(1, Math.min(50, raw)) : 10
  } else {
    roomTimedSeconds = Number.isFinite(raw) ? Math.max(30, Math.min(600, raw)) : 90
  }
  renderRoomSettings()
}

function renderRoomSettings() {
  const roomPool = filterAnime(allAnime, roomSettings)
  byId.roomPool.textContent = `${roomPool.length} 部`
  byId.roomModeLabel.textContent = roomMode === 'classic' ? '经典同步' : '限时冲分'
  byId.roomLengthLabel.textContent = roomMode === 'classic' ? '比赛题数' : '比赛秒数'
  byId.roomLengthInput.min = roomMode === 'classic' ? '1' : '30'
  byId.roomLengthInput.max = roomMode === 'classic' ? '50' : '600'
  byId.roomLengthInput.step = roomMode === 'classic' ? '1' : '10'
  byId.roomLengthInput.value = String(roomMode === 'classic' ? roomClassicRounds : roomTimedSeconds)
  byId.roomLength.textContent = roomMode === 'classic' ? `${roomClassicRounds} 题` : `${roomTimedSeconds} 秒`
  byId.roomModeClassic.setAttribute('aria-pressed', roomMode === 'classic' ? 'true' : 'false')
  byId.roomModeTimed.setAttribute('aria-pressed', roomMode === 'timed' ? 'true' : 'false')
  byId.roomModeNote.textContent =
    roomMode === 'classic'
      ? '经典模式：全员同题作答，等待所有人完成后进入下一题。'
      : '计时模式：玩家各自连续答题，只同步总时间，时间结束后统一结算。'
  byId.roomPresetButtons.forEach((button) => {
    button.setAttribute('aria-pressed', activeRoomPreset === button.dataset.roomPreset ? 'true' : 'false')
  })
  const canEdit = !localRoom || localRoom.role === '房主'
  ;[
    byId.roomModeClassic,
    byId.roomModeTimed,
    byId.roomLengthInput,
    byId.roomMinVotes,
    byId.roomScoreMin,
    byId.roomScoreMax,
    byId.roomYearMin,
    byId.roomYearMax,
    byId.roomRanking,
    ...byId.roomPresetButtons,
    ...Object.values(byId.roomExcludes),
  ].forEach((control) => {
    control.disabled = !canEdit
  })
}

function applyRoomPreset(name: PresetName) {
  roomSettings = applyPresetSettings(name)
  setRoomControlsFromSettings(roomSettings)
  syncRoomSettings()
}

function createLocalRoom() {
  localRoom = {
    code: generateRoomCode(),
    nickname: currentNickname(),
    role: '房主',
  }
  byId.roomCodeInput.value = localRoom.code
  renderRoom()
}

function joinLocalRoom() {
  const code = normalizeRoomCode(byId.roomCodeInput.value)
  if (code.length < 4) {
    localRoom = null
    renderRoom()
    byId.roomMessage.textContent = '请输入至少 4 位房间码。'
    return
  }
  byId.roomCodeInput.value = code
  localRoom = {
    code,
    nickname: currentNickname(),
    role: '玩家',
  }
  renderRoom()
}

function leaveLocalRoom() {
  localRoom = null
  renderRoom()
}

async function copyRoomCode() {
  if (!localRoom) return
  byId.roomCodeDisplay.select()
  byId.roomCodeDisplay.setSelectionRange(0, localRoom.code.length)
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(localRoom.code)
    } else {
      document.execCommand('copy')
    }
    showToast(`房间码 ${localRoom.code} 已复制`)
  } catch {
    document.execCommand('copy')
    showToast('已选中房间码，可手动复制')
  }
}

function card(side: Side) {
  return {
    root: $(`card-${side}`) as HTMLButtonElement,
    poster: $(`poster-${side}`),
    fallback: $(`poster-fallback-${side}`),
    image: $(`image-${side}`) as HTMLImageElement,
    title: $(`title-${side}`),
    meta: $(`meta-${side}`),
    score: $(`score-${side}`),
    chip: $(`chip-${side}`),
  }
}

function fallbackText(anime: Anime) {
  return titleOf(anime).trim().slice(0, 2) || '封面'
}

function renderCard(side: Side, anime: Anime | null) {
  const view = card(side)
  view.root.className = 'anime-card'
  view.chip.className = 'result-chip'
  view.chip.textContent = ''
  view.poster.dataset.loading = 'false'
  view.poster.dataset.failed = 'false'
  view.fallback.textContent = '封面加载中'
  if (!anime) {
    view.root.disabled = true
    view.title.textContent = '暂无题目'
    view.meta.textContent = '请调整筛选条件'
    view.score.textContent = '-'
    view.fallback.textContent = '暂无封面'
    view.image.removeAttribute('data-anime-id')
    view.image.removeAttribute('src')
    return
  }
  const shouldReveal = phase === 'reveal' || (side === 'left' && !firstRound)
  view.root.disabled = phase !== 'playing'
  view.poster.dataset.loading = 'true'
  view.image.dataset.animeId = String(anime.id)
  view.fallback.textContent = fallbackText(anime)
  view.image.onload = () => {
    if (view.image.dataset.animeId === String(anime.id)) view.poster.dataset.loading = 'false'
  }
  view.image.onerror = () => {
    if (view.image.dataset.animeId === String(anime.id)) {
      view.poster.dataset.loading = 'false'
      view.poster.dataset.failed = 'true'
      view.image.removeAttribute('src')
    }
  }
  if (view.image.src !== anime.image) {
    view.image.src = anime.image
  } else if (view.image.complete && view.image.naturalWidth > 0) {
    view.poster.dataset.loading = 'false'
  }
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
  byId.roundNote.textContent = '胜者进入下一轮，左侧会显示上一轮胜者的评分。'
  byId.dataUpdated.textContent = dataUpdatedAt ? `数据更新时间 ${dataUpdatedAt}` : '数据更新时间 --'
  byId.presetButtons.forEach((button) => {
    const pressed = activePreset === button.dataset.preset
    button.setAttribute('aria-pressed', pressed ? 'true' : 'false')
  })
}

function render() {
  renderCard('left', left)
  renderCard('right', right)
  renderStats()
  renderAppView()
  renderRoom()
}

function startTimer() {
  window.clearInterval(timerId)
  if (mode !== 'timed' || phase !== 'playing') return
  timerId = window.setInterval(() => {
    timeLeft -= 1
    renderStats()
    if (timeLeft <= 0) endGame('时间到')
  }, 1000)
}

function stopTimer() {
  window.clearInterval(timerId)
}

function showTimedReadyDialog() {
  if (!byId.timedReadyDialog.open) byId.timedReadyDialog.showModal()
}

function startTimedRound() {
  if (mode !== 'timed' || phase !== 'ready') return
  phase = 'playing'
  byId.timedReadyDialog.close()
  setPrompt('哪部动画评分更高？')
  startTimer()
  render()
}

function restartGame() {
  stopTimer()
  window.clearTimeout(revealId)
  if (byId.resultDialog.open) byId.resultDialog.close()
  if (byId.timedReadyDialog.open) byId.timedReadyDialog.close()
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
  const round = createInitialRound(pool)
  phase = round ? 'playing' : 'ended'
  left = null
  right = null
  if (round) {
    left = round.left
    right = round.right
    seen = round.seen
  }
  if (!left || !right) {
    setPrompt('当前筛选下题目不足，或评分都相同，请放宽条件。', 'bad')
  } else {
    if (mode === 'timed') {
      phase = 'ready'
      setPrompt('准备好后开始限时挑战')
      showTimedReadyDialog()
    } else {
      setPrompt('哪部动画评分更高？')
    }
  }
  render()
}

function select(side: Side) {
  if (phase !== 'playing' || !left || !right) return
  phase = 'reveal'
  selectedSide = side
  const result = judgeAnswer(left, right, side)
  isTie = result.isTie
  winningSide = result.winningSide
  stats = updateStats(stats, result.correct)
  if (!result.correct && mode === 'classic') lives -= 1
  diffBuckets = addDiffBucket(diffBuckets, result.diff)
  setPrompt(
    isTie
      ? `平分，都是 ${left.score.toFixed(1)} 分`
      : result.correct
        ? `答对，分差 ${result.diff.toFixed(1)}`
        : `答错，分差 ${result.diff.toFixed(1)}`,
    result.correct ? 'good' : 'bad',
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
  const next = pickNextAnime(pool, left, seen)
  if (!next) {
    endGame('题库用完')
    return
  }
  seen = next.seen
  right = next.anime
  seen.add(next.anime.id)
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
  activePreset = detectPreset(settings)
}

function applyPreset(name: PresetName) {
  const presetSettings = applyPresetSettings(name)
  byId.minVotes.value = String(presetSettings.minVotes)
  byId.scoreMin.value = String(presetSettings.scoreMin)
  byId.scoreMax.value = String(presetSettings.scoreMax)
  byId.yearMin.value = String(presetSettings.yearMin)
  byId.yearMax.value = String(presetSettings.yearMax)
  byId.ranking.value = presetSettings.ranking
  ;(Object.keys(byId.excludes) as ExcludeKey[]).forEach((key) => {
    byId.excludes[key].checked = presetSettings.excludes[key]
  })
  syncSettings()
  restartGame()
}

function bindEvents() {
  card('left').root.addEventListener('click', () => select('left'))
  card('right').root.addEventListener('click', () => select('right'))
  byId.viewSolo.addEventListener('click', () => switchView('solo'))
  byId.viewMultiplayer.addEventListener('click', () => switchView('multiplayer'))
  byId.restart.addEventListener('click', restartGame)
  byId.dialogRestart.addEventListener('click', restartGame)
  byId.timedReadyDialog.addEventListener('cancel', (event) => event.preventDefault())
  byId.timedStart.addEventListener('click', startTimedRound)
  byId.timedBackClassic.addEventListener('click', () => {
    byId.timedReadyDialog.close()
    mode = 'classic'
    restartGame()
  })
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
  byId.roomCodeInput.addEventListener('input', () => {
    byId.roomCodeInput.value = normalizeRoomCode(byId.roomCodeInput.value)
  })
  byId.playerName.addEventListener('input', () => {
    if (!localRoom) return
    localRoom.nickname = currentNickname()
    renderRoom()
  })
  byId.createRoom.addEventListener('click', createLocalRoom)
  byId.joinRoom.addEventListener('click', joinLocalRoom)
  byId.leaveRoom.addEventListener('click', leaveLocalRoom)
  byId.copyRoomCode.addEventListener('click', copyRoomCode)
  byId.toastClose.addEventListener('click', closeToast)
  byId.roomModeClassic.addEventListener('click', () => {
    roomMode = 'classic'
    renderRoomSettings()
  })
  byId.roomModeTimed.addEventListener('click', () => {
    roomMode = 'timed'
    renderRoomSettings()
  })
  byId.roomLengthInput.addEventListener('change', syncRoomLength)
  byId.roomLengthInput.addEventListener('input', syncRoomLength)
  ;[
    byId.roomMinVotes,
    byId.roomScoreMin,
    byId.roomScoreMax,
    byId.roomYearMin,
    byId.roomYearMax,
    byId.roomRanking,
    ...Object.values(byId.roomExcludes),
  ].forEach((control) => {
    control.addEventListener('change', syncRoomSettings)
    control.addEventListener('input', syncRoomSettings)
  })
  byId.roomPresetButtons.forEach((button) => {
    button.addEventListener('click', () => applyRoomPreset((button.dataset.roomPreset ?? 'standard') as PresetName))
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
    control.addEventListener('input', () => {
      syncSettings()
      renderStats()
    })
  })
  byId.presetButtons.forEach((button) => {
    button.addEventListener('click', () => applyPreset((button.dataset.preset ?? 'standard') as PresetName))
  })
  window.addEventListener('keydown', (event) => {
    if (event.key === '1') select('left')
    if (event.key === '2') select('right')
  })
}

async function boot() {
  bindEvents()
  try {
    const [response, metaResponse] = await Promise.all([fetch('/anime-seed.json'), fetch('/anime-seed-meta.json')])
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    allAnime = (await response.json()) as Anime[]
    if (metaResponse.ok) {
      const meta = (await metaResponse.json()) as AnimeSeedMeta
      dataUpdatedAt = formatUpdatedAt(meta.generatedAt)
    } else {
      dataUpdatedAt = formatUpdatedAt(response.headers.get('last-modified') ?? '')
    }
    syncSettings()
    syncRoomSettings()
    restartGame()
  } catch (error) {
    console.error(error)
    setPrompt('未找到题库，请先运行 npm run data:seed。', 'bad')
    phase = 'ended'
    render()
  }
}

boot()
