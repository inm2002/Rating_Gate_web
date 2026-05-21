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
type RoomYearRange = 'all' | 'before2010' | 'decade2010' | 'after2020'

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

type RoomStatus = 'lobby' | 'question' | 'reveal' | 'ended'

type RemoteAnime = Omit<Anime, 'tags' | 'score'> & { score?: number }

interface RemotePair {
  left: RemoteAnime
  right: RemoteAnime
}

interface RemotePlayer {
  id: string
  nickname: string
  isHost: boolean
  score: number
  total: number
  streak: number
  answered: boolean
}

interface RemoteReveal {
  pair?: RemotePair
  answers?: Record<string, { selectedSide: Side; correct: boolean; winningSide: Side; diff: number }>
  selectedSide?: Side
  correct?: boolean
  winningSide?: Side
  diff?: number
  reason?: string
}

interface RemoteRoom {
  code: string
  youId: string
  hostId: string
  status: RoomStatus
  mode: Mode
  length: number
  settings: Settings
  poolCount: number
  players: RemotePlayer[]
}

interface RemoteGame {
  status: RoomStatus
  mode: Mode
  round: number
  length: number
  startAt: number | null
  durationMs: number | null
  endsAt: number | null
  pair: RemotePair | null
  selectedSide: Side | null
  reveal: RemoteReveal | null
}

const BEST_KEY = 'aniscore-arena-best-v1'
const YEAR_MIN_LIMIT = 1900
const YEAR_MAX_LIMIT = 2030
const ROOM_WS_URL =
  import.meta.env.VITE_WS_URL ??
  (location.protocol === 'https:' ? `wss://${location.host}/ws` : 'ws://127.0.0.1:8787')

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('Missing #app')

let allAnime: Anime[] = []
let dataUpdatedAt = ''
let pool: Anime[] = []
let seen = new Set<number>()
let appView: AppView = 'solo'
let localRoom: LocalRoom | null = null
let remoteRoom: RemoteRoom | null = null
let remoteGame: RemoteGame | null = null
let roomSocket: WebSocket | null = null
let roomConnectPromise: Promise<boolean> | null = null
let roomResultShownKey = ''
let roomClockTimer = 0
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
          <h1>Rating;Gate</h1>
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
            <span class="round-note" id="round-note">胜者进入下一轮，左侧会显示上一轮胜者的评分。可按 1 / 2 快速选择左右。</span>
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
              <input id="score-min" class="score-input" type="text" inputmode="decimal" pattern="[0-9]*[.]?[0-9]?" maxlength="4" value="0" autocomplete="off" />
            </label>
            <label class="control-field">
              <span>最高评分</span>
              <input id="score-max" class="score-input" type="text" inputmode="decimal" pattern="[0-9]*[.]?[0-9]?" maxlength="4" value="10" autocomplete="off" />
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
      <div class="room-card room-entry" id="room-entry">
        <div class="room-heading">
          <div>
            <p class="eyebrow">多人模式</p>
            <h2>创建或加入房间</h2>
          </div>
          <span class="room-state" id="room-entry-state">联机未连接</span>
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
        <p class="room-message" id="room-message">创建房间后分享房间码，或输入好友的房间码加入。</p>
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
                <input id="room-score-min" class="score-input" type="text" inputmode="decimal" pattern="[0-9]*[.]?[0-9]?" maxlength="4" value="0" autocomplete="off" />
              </label>
              <label class="control-field">
                <span>最高评分</span>
                <input id="room-score-max" class="score-input" type="text" inputmode="decimal" pattern="[0-9]*[.]?[0-9]?" maxlength="4" value="10" autocomplete="off" />
              </label>
            </div>

            <div class="year-filter">
              <div class="range-row">
                <label class="control-field">
                  <span>起始年份</span>
                  <input id="room-year-min" class="year-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" value="1900" autocomplete="off" />
                </label>
                <label class="control-field">
                  <span>结束年份</span>
                  <input id="room-year-max" class="year-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" value="${new Date().getFullYear()}" autocomplete="off" />
                </label>
              </div>
              <div class="year-shortcuts" aria-label="年份快捷选择">
                <button type="button" data-room-year-range="all">全量</button>
                <button type="button" data-room-year-range="before2010">2010 前</button>
                <button type="button" data-room-year-range="decade2010">2010-2019</button>
                <button type="button" data-room-year-range="after2020">2020 后</button>
              </div>
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

      <div class="room-battle" id="room-battle" hidden>
        <section class="stage room-stage" aria-live="polite">
          <div class="stage-head">
            <div>
              <p class="prompt" id="room-match-title">联机比赛</p>
              <span class="round-note" id="room-match-note">等待房主开始比赛。</span>
            </div>
            <div class="room-stage-actions">
              <span class="room-state" id="room-match-state">第 1 题</span>
              <button class="ghost-button" id="leave-room-battle" type="button">离开房间</button>
            </div>
          </div>
          <div class="arena">
            <button class="anime-card" id="room-answer-left" type="button" aria-label="选择左侧动画">
              <span class="poster-wrap" id="room-poster-left" data-loading="true">
                <span class="poster-fallback" id="room-poster-fallback-left">封面加载中</span>
                <img id="room-image-left" alt="" />
              </span>
              <span class="card-copy">
                <span class="card-meta" id="room-meta-left"></span>
                <strong id="room-title-left">左侧动画</strong>
                <span class="score-line" id="room-score-left">?</span>
              </span>
              <span class="result-chip" id="room-chip-left"></span>
            </button>
            <div class="versus" aria-hidden="true">VS</div>
            <button class="anime-card" id="room-answer-right" type="button" aria-label="选择右侧动画">
              <span class="poster-wrap" id="room-poster-right" data-loading="true">
                <span class="poster-fallback" id="room-poster-fallback-right">封面加载中</span>
                <img id="room-image-right" alt="" />
              </span>
              <span class="card-copy">
                <span class="card-meta" id="room-meta-right"></span>
                <strong id="room-title-right">右侧动画</strong>
                <span class="score-line" id="room-score-right">?</span>
              </span>
              <span class="result-chip" id="room-chip-right"></span>
            </button>
          </div>
        </section>

        <aside class="side-panel room-side-panel">
          <section class="scoreboard room-scoreboard" aria-label="联机比赛状态">
            <div class="metric"><span id="room-info-code">------</span><small>房间</small></div>
            <div class="metric"><span id="room-info-mode">经典</span><small>模式</small></div>
            <div class="metric"><span id="room-info-progress">0/0</span><small>进度</small></div>
            <div class="metric"><span id="room-info-players">0/8</span><small>玩家</small></div>
          </section>
          <section class="panel room-member-panel">
            <div class="panel-title">
              <h2>成员状态</h2>
              <span id="room-battle-status">比赛中</span>
            </div>
            <div class="player-list" id="room-battle-player-list"></div>
          </section>
        </aside>
      </div>

      <div class="room-card room-guide" id="room-guide">
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
      <span>仓库 <a href="https://github.com/inm2002/Rating_Gate_web" target="_blank" rel="noopener">inm2002/Rating_Gate_web</a></span>
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

  <dialog id="room-result-dialog" class="result-dialog room-result-dialog">
    <div class="result-box">
      <p class="result-kicker">联机比赛结束</p>
      <h2>本场排名</h2>
      <div class="room-rank-list" id="room-rank-list"></div>
      <div class="dialog-actions">
        <button class="primary-button" id="room-result-close" type="button">回到大厅</button>
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
  roomEntryState: $('room-entry-state'),
  createRoom: $('create-room') as HTMLButtonElement,
  joinRoom: $('join-room') as HTMLButtonElement,
  roomMessage: $('room-message'),
  roomEntry: $('room-entry'),
  roomLobby: $('room-lobby'),
  roomGuide: $('room-guide'),
  roomBattle: $('room-battle'),
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
  roomYearButtons: [...document.querySelectorAll<HTMLButtonElement>('[data-room-year-range]')],
  roomRanking: $('room-ranking') as HTMLSelectElement,
  roomPool: $('room-pool'),
  roomLength: $('room-length'),
  roomPlayerCount: $('room-player-count'),
  roomPlayerList: $('room-player-list'),
  roomMatchTitle: $('room-match-title'),
  roomMatchState: $('room-match-state'),
  roomMatchNote: $('room-match-note'),
  roomAnswerLeft: $('room-answer-left') as HTMLButtonElement,
  roomAnswerRight: $('room-answer-right') as HTMLButtonElement,
  roomPosterLeft: $('room-poster-left'),
  roomPosterRight: $('room-poster-right'),
  roomPosterFallbackLeft: $('room-poster-fallback-left'),
  roomPosterFallbackRight: $('room-poster-fallback-right'),
  roomImageLeft: $('room-image-left') as HTMLImageElement,
  roomImageRight: $('room-image-right') as HTMLImageElement,
  roomMetaLeft: $('room-meta-left'),
  roomMetaRight: $('room-meta-right'),
  roomTitleLeft: $('room-title-left'),
  roomTitleRight: $('room-title-right'),
  roomScoreLeft: $('room-score-left'),
  roomScoreRight: $('room-score-right'),
  roomChipLeft: $('room-chip-left'),
  roomChipRight: $('room-chip-right'),
  roomInfoCode: $('room-info-code'),
  roomInfoMode: $('room-info-mode'),
  roomInfoProgress: $('room-info-progress'),
  roomInfoPlayers: $('room-info-players'),
  roomBattleStatus: $('room-battle-status'),
  roomBattlePlayerList: $('room-battle-player-list'),
  roomStart: $('room-start') as HTMLButtonElement,
  leaveRoom: $('leave-room') as HTMLButtonElement,
  leaveRoomBattle: $('leave-room-battle') as HTMLButtonElement,
  roomResultDialog: $('room-result-dialog') as HTMLDialogElement,
  roomRankList: $('room-rank-list'),
  roomResultClose: $('room-result-close') as HTMLButtonElement,
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

function formatScoreInput(value: number) {
  return value.toFixed(1).replace('.0', '')
}

function sanitizeScoreInput(input: HTMLInputElement) {
  let value = input.value.replace(/[^\d.]/g, '')
  const firstDot = value.indexOf('.')
  if (firstDot !== -1) {
    value = `${value.slice(0, firstDot + 1)}${value.slice(firstDot + 1).replace(/\./g, '')}`
  }
  if (value.startsWith('.')) value = `0${value}`
  const [integer = '', decimal] = value.split('.')
  const trimmedInteger = integer.slice(0, 2)
  value = decimal === undefined ? trimmedInteger : `${trimmedInteger}.${decimal.slice(0, 1)}`
  if (input.value !== value) input.value = value
  return value
}

function isCompleteScore(value: string) {
  return /^(?:10(?:\.0)?|[0-9](?:\.[0-9])?)$/.test(value)
}

function clampScore(value: number) {
  return Math.round(Math.max(0, Math.min(10, value)) * 10) / 10
}

function readScore(input: HTMLInputElement, fallback: number) {
  const value = Number.parseFloat(input.value)
  return Number.isFinite(value) ? clampScore(value) : fallback
}

function formatUpdatedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
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
    void connectRoomSocket()
  }
  renderAppView()
  renderRoom()
}

function normalizeRoomCode(value: string) {
  return value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6)
}

function currentNickname() {
  return byId.playerName.value.trim().slice(0, 16) || '鉴分员'
}

function isRoomSocketOpen() {
  return roomSocket?.readyState === WebSocket.OPEN
}

function setRoomConnectionState(label: string, tone: 'neutral' | 'bad' = 'neutral') {
  byId.roomEntryState.textContent = label
  byId.roomEntryState.dataset.tone = tone
}

function handleRoomMessage(event: MessageEvent<string>) {
  const message = JSON.parse(event.data) as
    | { type: 'connected' }
    | { type: 'roomState'; room: RemoteRoom }
    | { type: 'gameState'; game: RemoteGame }
    | { type: 'error'; message: string }

  if (message.type === 'connected') {
    setRoomConnectionState('联机已连接')
    return
  }
  if (message.type === 'error') {
    byId.roomMessage.textContent = message.message
    showToast(message.message)
    return
  }
  if (message.type === 'roomState') {
    remoteRoom = message.room
    if (remoteRoom.status === 'lobby') {
      remoteGame = null
      window.clearInterval(roomClockTimer)
      if (byId.roomResultDialog.open) byId.roomResultDialog.close()
    }
    const you = remoteRoom.players.find((player) => player.id === remoteRoom?.youId)
    localRoom = {
      code: remoteRoom.code,
      nickname: you?.nickname ?? currentNickname(),
      role: you?.isHost ? '房主' : '玩家',
    }
    roomMode = remoteRoom.mode
    if (roomMode === 'classic') roomClassicRounds = remoteRoom.length
    else roomTimedSeconds = remoteRoom.length
    roomSettings = remoteRoom.settings
    activeRoomPreset = detectPreset(roomSettings)
    setRoomControlsFromSettings(roomSettings)
    renderRoom()
    return
  }
  remoteGame = message.game
  renderRoom()
  syncRoomClock()
}

function connectRoomSocket() {
  if (isRoomSocketOpen()) return Promise.resolve(true)
  if (roomConnectPromise) return roomConnectPromise

  setRoomConnectionState('正在连接')
  roomSocket = new WebSocket(ROOM_WS_URL)
  roomSocket.addEventListener('message', handleRoomMessage)
  roomSocket.addEventListener('close', () => {
    roomConnectPromise = null
    setRoomConnectionState('联机未连接', 'bad')
    if (remoteRoom) byId.roomMessage.textContent = '联机服务已断开，请刷新页面后重试。'
  })
  roomSocket.addEventListener('error', () => {
    setRoomConnectionState('连接失败', 'bad')
  })
  roomConnectPromise = new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      setRoomConnectionState('连接超时', 'bad')
      roomConnectPromise = null
      resolve(false)
    }, 2500)
    roomSocket?.addEventListener(
      'open',
      () => {
        window.clearTimeout(timeout)
        setRoomConnectionState('联机已连接')
        roomConnectPromise = null
        resolve(true)
      },
      { once: true },
    )
    roomSocket?.addEventListener(
      'error',
      () => {
        window.clearTimeout(timeout)
        roomConnectPromise = null
        resolve(false)
      },
      { once: true },
    )
  })
  return roomConnectPromise
}

function sendRoomMessage(payload: Record<string, unknown>) {
  if (!isRoomSocketOpen()) {
    byId.roomMessage.textContent = '联机服务暂时不可用，请稍后重试。'
    showToast('联机服务未连接')
    return false
  }
  roomSocket?.send(JSON.stringify(payload))
  return true
}

function syncRoomClock() {
  window.clearInterval(roomClockTimer)
  if (remoteGame?.mode !== 'timed' || remoteGame.status !== 'question') return
  roomClockTimer = window.setInterval(() => {
    renderRoomMatch()
  }, 1000)
}

function roomLengthPayload() {
  return {
    length: roomMode === 'classic' ? roomClassicRounds : roomTimedSeconds,
    classicRounds: roomClassicRounds,
    timedSeconds: roomTimedSeconds,
  }
}

function pushRoomSettings() {
  if (!remoteRoom || localRoom?.role !== '房主' || remoteRoom.status !== 'lobby') return
  sendRoomMessage({
    type: 'updateSettings',
    mode: roomMode,
    settings: roomSettings,
    ...roomLengthPayload(),
  })
}

function titleOfRemote(anime: RemoteAnime) {
  return anime.nameCn || anime.name
}

function yearOfRemote(anime: RemoteAnime) {
  const year = Number.parseInt(anime.date.slice(0, 4), 10)
  return Number.isFinite(year) ? year : 0
}

function renderRoom() {
  renderRoomSettings()
  if (!localRoom) {
    byId.roomEntry.hidden = false
    byId.roomLobby.hidden = true
    byId.roomGuide.hidden = false
    byId.roomBattle.hidden = true
    byId.roomCodeDisplay.value = '------'
    byId.roomMessage.textContent = '创建房间后分享房间码，或输入好友的房间码加入。'
    return
  }
  byId.roomCodeDisplay.value = localRoom.code
  byId.roomRole.textContent = localRoom.role
  const room = remoteRoom
  if (!room) return
  const inBattle = room.status !== 'lobby'
  byId.roomEntry.hidden = inBattle
  byId.roomLobby.hidden = inBattle
  byId.roomGuide.hidden = inBattle
  byId.roomBattle.hidden = !inBattle
  const statusText: Record<RoomStatus, string> = {
    lobby: localRoom.role === '房主' ? '等待玩家' : '已加入',
    question: room.mode === 'classic' ? '同步作答中' : '限时冲分中',
    reveal: '本题结算',
    ended: '比赛结束',
  }
  byId.roomStatus.textContent = statusText[room.status]
  byId.roomMessage.textContent =
    localRoom.role === '房主'
      ? `房间 ${localRoom.code} 已创建，玩家可输入房间码加入。`
      : `已加入房间 ${localRoom.code}，等待房主开始。`
  byId.roomPlayerCount.textContent = `${room.players.length}/8`
  const sortedPlayers = [...room.players].sort((a, b) => Number(b.isHost) - Number(a.isHost))
  const playerRows = sortedPlayers
    .map((player) => {
      const isYou = player.id === room.youId
      const role = player.isHost ? '房主' : '玩家'
      const answerState =
        room.status === 'question' && room.mode === 'classic' ? (player.answered ? ' · 已答' : ' · 思考中') : ''
      return `<div class="player-row${isYou ? ' is-you' : ''}">
        <span>${escapeHtml(player.nickname)}${isYou ? '（你）' : ''}</span>
        <b>${role} · ${player.score} 分${answerState}</b>
      </div>`
    })
    .join('')
  const waitingRow =
    room.status === 'lobby' && room.players.length < 2
      ? '<div class="player-row is-empty"><span>等待玩家加入</span><b>空位</b></div>'
      : ''
  byId.roomPlayerList.innerHTML = `${playerRows}${waitingRow}`
  byId.roomBattlePlayerList.innerHTML = playerRows
  byId.roomStart.disabled = localRoom.role !== '房主' || room.status !== 'lobby' || room.poolCount < 2
  byId.roomPool.textContent = `${room.poolCount} 部`
  renderRoomMatch()
}

function roomCard(side: Side) {
  return {
    root: side === 'left' ? byId.roomAnswerLeft : byId.roomAnswerRight,
    poster: side === 'left' ? byId.roomPosterLeft : byId.roomPosterRight,
    fallback: side === 'left' ? byId.roomPosterFallbackLeft : byId.roomPosterFallbackRight,
    image: side === 'left' ? byId.roomImageLeft : byId.roomImageRight,
    meta: side === 'left' ? byId.roomMetaLeft : byId.roomMetaRight,
    title: side === 'left' ? byId.roomTitleLeft : byId.roomTitleRight,
    score: side === 'left' ? byId.roomScoreLeft : byId.roomScoreRight,
    chip: side === 'left' ? byId.roomChipLeft : byId.roomChipRight,
  }
}

function renderRoomSide(side: Side, pair: RemotePair | null, reveal: RemoteReveal | null) {
  const anime = pair?.[side]
  const view = roomCard(side)
  view.root.className = 'anime-card'
  view.chip.className = 'result-chip'
  view.chip.textContent = ''
  view.poster.dataset.loading = 'false'
  view.poster.dataset.failed = 'false'
  view.fallback.textContent = '封面加载中'
  if (!anime) {
    view.root.disabled = true
    view.meta.textContent = ''
    view.title.textContent = '暂无题目'
    view.score.textContent = '-'
    view.fallback.textContent = '暂无封面'
    view.image.removeAttribute('data-anime-id')
    view.image.removeAttribute('src')
    return
  }
  view.poster.dataset.loading = 'true'
  view.image.dataset.animeId = String(anime.id)
  view.fallback.textContent = titleOfRemote(anime).trim().slice(0, 2) || '封面'
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
  view.image.alt = `${titleOfRemote(anime)} 封面`
  view.meta.textContent = `${yearOfRemote(anime) || '未知'} · ${anime.platform || '动画'} · ${(anime.votes ?? 0).toLocaleString()} votes`
  view.title.textContent = titleOfRemote(anime)
  view.score.textContent = typeof anime.score === 'number' ? anime.score.toFixed(1) : '?'
  view.score.classList.toggle('hidden-score', typeof anime.score !== 'number')
  const revealWinner = reveal?.winningSide === side
  const selected = reveal?.selectedSide === side
  view.root.classList.toggle('is-selected', selected)
  view.root.classList.toggle('is-winner', revealWinner)
  view.root.classList.toggle('is-wrong', selected && reveal?.correct === false)
  view.root.classList.toggle('is-correct', selected && reveal?.correct === true)
  if (selected && typeof reveal?.correct === 'boolean') {
    view.chip.textContent = reveal?.correct ? '✓ 正确' : '✕ 错误'
    view.chip.classList.add(reveal?.correct ? 'is-correct' : 'is-wrong')
  } else if (revealWinner) {
    view.chip.textContent = '高分'
    view.chip.classList.add('is-winner')
  }
}

function renderRoomMatch() {
  const room = remoteRoom
  const game = remoteGame
  const reveal =
    game?.mode === 'classic' && game.reveal?.answers && remoteRoom
      ? { ...game.reveal, ...game.reveal.answers[remoteRoom.youId] }
      : (game?.reveal ?? null)
  const pair = room?.mode === 'classic' && reveal?.pair ? reveal.pair : (game?.pair ?? null)
  if (!room || !game) return

  const you = room.players.find((player) => player.id === room.youId)
  const youAnswered = Boolean(you?.answered)
  const classicWaiting = room.mode === 'classic' && room.status === 'question' && youAnswered
  const canAnswer = room.status === 'question' && !classicWaiting && Boolean(game.pair)
  const timedEndsAt =
    game.startAt && game.durationMs ? game.startAt + game.durationMs : game.endsAt
  const progress =
    room.mode === 'classic'
      ? `第 ${Math.min(game.round, game.length)} / ${game.length} 题`
      : timedEndsAt
        ? `剩余 ${Math.max(0, Math.ceil((timedEndsAt - Date.now()) / 1000))} 秒`
        : '限时冲分'

  byId.roomMatchTitle.textContent = room.mode === 'classic' ? '经典同步赛' : '限时冲分赛'
  byId.roomMatchState.textContent = room.status === 'ended' ? '比赛结束' : progress
  byId.roomInfoCode.textContent = room.code
  byId.roomInfoMode.textContent = room.mode === 'classic' ? '经典' : '限时'
  byId.roomInfoProgress.textContent = room.mode === 'classic' ? `${Math.min(game.round, game.length)}/${game.length}` : progress
  byId.roomInfoPlayers.textContent = `${room.players.length}/8`
  byId.roomBattleStatus.textContent = room.status === 'ended' ? '已结束' : statusTextForBattle(room.status)
  byId.roomMatchNote.textContent =
    room.status === 'ended'
      ? '比赛结束，房主可以离开后重新创建房间。'
      : room.status === 'reveal'
        ? '本题已结算，稍后自动进入下一题。'
        : classicWaiting
          ? '你已作答，等待房间内所有玩家完成后统一结算。'
          : room.mode === 'classic'
            ? '所有人看到同一道题，全部作答后进入下一题。可按 1 / 2 快速选择左右。'
            : game.reveal?.correct === true
              ? '上一题答对，继续冲分。'
              : game.reveal?.correct === false
                ? '上一题答错，下一题继续。'
                : '每位玩家各自连续作答，只有总时间同步。可按 1 / 2 快速选择左右。'
  const pendingSelection: RemoteReveal | null = !reveal && game.selectedSide ? { selectedSide: game.selectedSide } : null
  const cardReveal = room.mode === 'classic' ? (reveal ?? pendingSelection) : null
  renderRoomSide('left', pair, cardReveal)
  renderRoomSide('right', pair, cardReveal)
  byId.roomAnswerLeft.disabled = !canAnswer
  byId.roomAnswerRight.disabled = !canAnswer
  if (room.status === 'ended') showRoomResultDialog(room)
}

function statusTextForBattle(status: RoomStatus) {
  if (status === 'question') return '作答中'
  if (status === 'reveal') return '结算中'
  if (status === 'ended') return '已结束'
  return '等待中'
}

function showRoomResultDialog(room: RemoteRoom) {
  const key = `${room.code}-${room.players.map((player) => `${player.id}:${player.score}:${player.total}`).join('|')}`
  if (roomResultShownKey === key || byId.roomResultDialog.open) return
  roomResultShownKey = key
  const ranked = [...room.players].sort((a, b) => b.score - a.score || b.streak - a.streak || a.nickname.localeCompare(b.nickname))
  byId.roomRankList.innerHTML = ranked
    .map(
      (player, index) => `<div class="rank-row${player.id === room.youId ? ' is-you' : ''}">
        <span>${index + 1}</span>
        <strong>${escapeHtml(player.nickname)}${player.id === room.youId ? '（你）' : ''}</strong>
        <b>${player.score} 分 / ${player.total} 题</b>
      </div>`,
    )
    .join('')
  byId.roomResultDialog.showModal()
}

function sanitizeYearInput(input: HTMLInputElement) {
  const sanitized = input.value.replace(/\D/g, '').slice(0, 4)
  if (input.value !== sanitized) input.value = sanitized
  return sanitized
}

function isCompleteYear(value: string) {
  return /^\d{4}$/.test(value)
}

function clampYear(value: number) {
  return Math.max(YEAR_MIN_LIMIT, Math.min(YEAR_MAX_LIMIT, value))
}

function readRoomYear(input: HTMLInputElement, fallback: number) {
  const value = Number.parseInt(input.value, 10)
  return Number.isFinite(value) ? clampYear(value) : fallback
}

function renderRoomPresetState() {
  byId.roomPresetButtons.forEach((button) => {
    button.setAttribute('aria-pressed', activeRoomPreset === button.dataset.roomPreset ? 'true' : 'false')
  })
}

function detectRoomYearRange(): RoomYearRange | null {
  const currentYear = new Date().getFullYear()
  if (roomSettings.yearMin === YEAR_MIN_LIMIT && roomSettings.yearMax === currentYear) return 'all'
  if (roomSettings.yearMin === YEAR_MIN_LIMIT && roomSettings.yearMax === 2009) return 'before2010'
  if (roomSettings.yearMin === 2010 && roomSettings.yearMax === 2019) return 'decade2010'
  if (roomSettings.yearMin === 2020 && roomSettings.yearMax === currentYear) return 'after2020'
  return null
}

function renderRoomYearShortcutState(activeRange = detectRoomYearRange()) {
  byId.roomYearButtons.forEach((button) => {
    button.setAttribute('aria-pressed', activeRange === button.dataset.roomYearRange ? 'true' : 'false')
  })
}

function setRoomControlsFromSettings(nextSettings: Settings, options: { forceScores?: boolean; forceYears?: boolean } = {}) {
  byId.roomMinVotes.value = String(nextSettings.minVotes)
  const editingScore = document.activeElement === byId.roomScoreMin || document.activeElement === byId.roomScoreMax
  if (options.forceScores || !editingScore) {
    byId.roomScoreMin.value = formatScoreInput(nextSettings.scoreMin)
    byId.roomScoreMax.value = formatScoreInput(nextSettings.scoreMax)
  }
  const editingYear = document.activeElement === byId.roomYearMin || document.activeElement === byId.roomYearMax
  if (options.forceYears || !editingYear) {
    byId.roomYearMin.value = String(nextSettings.yearMin)
    byId.roomYearMax.value = String(nextSettings.yearMax)
  }
  byId.roomRanking.value = nextSettings.ranking
  ;(Object.keys(byId.roomExcludes) as ExcludeKey[]).forEach((key) => {
    byId.roomExcludes[key].checked = nextSettings.excludes[key]
  })
}

function syncRoomSettings(options: { normalizeScores?: boolean } = {}) {
  roomSettings = {
    minVotes: Number.parseInt(byId.roomMinVotes.value, 10),
    scoreMin: readScore(byId.roomScoreMin, roomSettings.scoreMin),
    scoreMax: readScore(byId.roomScoreMax, roomSettings.scoreMax),
    yearMin: readRoomYear(byId.roomYearMin, roomSettings.yearMin),
    yearMax: readRoomYear(byId.roomYearMax, roomSettings.yearMax),
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
  if (roomSettings.yearMin > roomSettings.yearMax) {
    ;[roomSettings.yearMin, roomSettings.yearMax] = [roomSettings.yearMax, roomSettings.yearMin]
  }
  if (options.normalizeScores) {
    byId.roomScoreMin.value = formatScoreInput(roomSettings.scoreMin)
    byId.roomScoreMax.value = formatScoreInput(roomSettings.scoreMax)
  }
  byId.roomMinVotesLabel.textContent = String(roomSettings.minVotes)
  activeRoomPreset = detectPreset(roomSettings)
  renderRoomSettings()
  pushRoomSettings()
}

function handleRoomScoreInput(input: HTMLInputElement) {
  const value = sanitizeScoreInput(input)
  activeRoomPreset = null
  renderRoomPresetState()
  const minValue = byId.roomScoreMin.value
  const maxValue = byId.roomScoreMax.value
  if (isCompleteScore(value) && isCompleteScore(minValue) && isCompleteScore(maxValue)) syncRoomSettings()
}

function commitRoomScores() {
  syncRoomSettings({ normalizeScores: true })
}

function commitRoomYears(options: { normalize?: boolean } = {}) {
  const yearMin = readRoomYear(byId.roomYearMin, roomSettings.yearMin)
  const yearMax = readRoomYear(byId.roomYearMax, roomSettings.yearMax)
  const nextMin = Math.min(yearMin, yearMax)
  const nextMax = Math.max(yearMin, yearMax)
  if (options.normalize) {
    byId.roomYearMin.value = String(nextMin)
    byId.roomYearMax.value = String(nextMax)
  }
  syncRoomSettings()
}

function handleRoomYearInput(input: HTMLInputElement) {
  sanitizeYearInput(input)
  activeRoomPreset = null
  renderRoomPresetState()
  renderRoomYearShortcutState(null)
  const minValue = byId.roomYearMin.value
  const maxValue = byId.roomYearMax.value
  if (isCompleteYear(minValue) && isCompleteYear(maxValue)) commitRoomYears()
}

function applyRoomYearRange(range: RoomYearRange) {
  const currentYear = new Date().getFullYear()
  const ranges: Record<RoomYearRange, [number, number]> = {
    all: [YEAR_MIN_LIMIT, currentYear],
    before2010: [YEAR_MIN_LIMIT, 2009],
    decade2010: [2010, 2019],
    after2020: [2020, currentYear],
  }
  const [yearMin, yearMax] = ranges[range]
  byId.roomYearMin.value = String(yearMin)
  byId.roomYearMax.value = String(yearMax)
  commitRoomYears()
}

function syncRoomLength() {
  const raw = Number.parseInt(byId.roomLengthInput.value, 10)
  if (roomMode === 'classic') {
    roomClassicRounds = Number.isFinite(raw) ? Math.max(1, Math.min(50, raw)) : 10
  } else {
    roomTimedSeconds = Number.isFinite(raw) ? Math.max(30, Math.min(600, raw)) : 90
  }
  renderRoomSettings()
  pushRoomSettings()
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
  renderRoomPresetState()
  renderRoomYearShortcutState()
  const canEdit = !localRoom || (localRoom.role === '房主' && (!remoteRoom || remoteRoom.status === 'lobby'))
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
    ...byId.roomYearButtons,
    ...Object.values(byId.roomExcludes),
  ].forEach((control) => {
    control.disabled = !canEdit
  })
}

function applyRoomPreset(name: PresetName) {
  roomSettings = applyPresetSettings(name)
  setRoomControlsFromSettings(roomSettings, { forceScores: true, forceYears: true })
  syncRoomSettings({ normalizeScores: true })
}

async function createNetworkRoom() {
  syncRoomLength()
  syncRoomSettings()
  const connected = await connectRoomSocket()
  if (!connected) {
    byId.roomMessage.textContent = '无法连接联机服务，请稍后重试。'
    return
  }
  remoteGame = null
  roomResultShownKey = ''
  sendRoomMessage({
    type: 'createRoom',
    nickname: currentNickname(),
    mode: roomMode,
    settings: roomSettings,
    ...roomLengthPayload(),
  })
}

async function joinNetworkRoom() {
  const code = normalizeRoomCode(byId.roomCodeInput.value)
  if (code.length < 4) {
    localRoom = null
    remoteRoom = null
    remoteGame = null
    renderRoom()
    byId.roomMessage.textContent = '请输入至少 4 位房间码。'
    return
  }
  byId.roomCodeInput.value = code
  const connected = await connectRoomSocket()
  if (!connected) {
    byId.roomMessage.textContent = '无法连接联机服务，请稍后重试。'
    return
  }
  remoteGame = null
  roomResultShownKey = ''
  sendRoomMessage({ type: 'joinRoom', nickname: currentNickname(), roomCode: code })
}

function leaveNetworkRoom() {
  sendRoomMessage({ type: 'leaveRoom' })
  window.clearInterval(roomClockTimer)
  localRoom = null
  remoteRoom = null
  remoteGame = null
  roomResultShownKey = ''
  if (byId.roomResultDialog.open) byId.roomResultDialog.close()
  renderRoom()
}

function returnRoomToLobby() {
  if (byId.roomResultDialog.open) byId.roomResultDialog.close()
  sendRoomMessage({ type: 'returnToLobby' })
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
  byId.roundNote.textContent = '胜者进入下一轮，左侧会显示上一轮胜者的评分。可按 1 / 2 快速选择左右。'
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

function syncSettings(options: { normalizeScores?: boolean } = {}) {
  settings = {
    minVotes: Number.parseInt(byId.minVotes.value, 10),
    scoreMin: readScore(byId.scoreMin, settings.scoreMin),
    scoreMax: readScore(byId.scoreMax, settings.scoreMax),
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
  if (options.normalizeScores) {
    byId.scoreMin.value = formatScoreInput(settings.scoreMin)
    byId.scoreMax.value = formatScoreInput(settings.scoreMax)
  }
  byId.minVotesLabel.textContent = String(settings.minVotes)
  activePreset = detectPreset(settings)
}

function renderPresetState() {
  byId.presetButtons.forEach((button) => {
    button.setAttribute('aria-pressed', activePreset === button.dataset.preset ? 'true' : 'false')
  })
}

function handleScoreInput(input: HTMLInputElement) {
  const value = sanitizeScoreInput(input)
  activePreset = null
  renderPresetState()
  const minValue = byId.scoreMin.value
  const maxValue = byId.scoreMax.value
  if (isCompleteScore(value) && isCompleteScore(minValue) && isCompleteScore(maxValue)) {
    syncSettings()
    renderStats()
  }
}

function commitScores() {
  syncSettings({ normalizeScores: true })
  restartGame()
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const control = target.closest<HTMLElement>('input, select, textarea, button, [contenteditable="true"]')
  if (!control || control.closest('[hidden]')) return false
  return Boolean(control.offsetWidth || control.offsetHeight || control.getClientRects().length)
}

function hasOpenDialog() {
  return Boolean(document.querySelector('dialog[open]'))
}

function handleAnswerShortcut(event: KeyboardEvent) {
  if (event.key !== '1' && event.key !== '2') return
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return
  if (isTypingTarget(event.target) || hasOpenDialog()) return

  const side: Side = event.key === '1' ? 'left' : 'right'
  if (appView === 'solo' && phase === 'playing') {
    event.preventDefault()
    select(side)
    return
  }
  if (appView === 'multiplayer' && remoteRoom?.status === 'question' && remoteGame?.pair) {
    event.preventDefault()
    sendRoomMessage({ type: 'answer', side })
  }
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
  syncSettings({ normalizeScores: true })
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
    const text = `Rating;Gate：${mode === 'timed' ? '限时' : '经典'}模式答对 ${stats.correct}/${stats.total}，最高连击 ${stats.bestStreak}`
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
    sendRoomMessage({ type: 'updateNickname', nickname: currentNickname() })
    renderRoom()
  })
  byId.createRoom.addEventListener('click', createNetworkRoom)
  byId.joinRoom.addEventListener('click', joinNetworkRoom)
  byId.leaveRoom.addEventListener('click', leaveNetworkRoom)
  byId.leaveRoomBattle.addEventListener('click', leaveNetworkRoom)
  byId.roomResultClose.addEventListener('click', returnRoomToLobby)
  byId.copyRoomCode.addEventListener('click', copyRoomCode)
  byId.toastClose.addEventListener('click', closeToast)
  byId.roomStart.addEventListener('click', () => {
    roomResultShownKey = ''
    sendRoomMessage({ type: 'startGame' })
  })
  byId.roomAnswerLeft.addEventListener('click', () => sendRoomMessage({ type: 'answer', side: 'left' }))
  byId.roomAnswerRight.addEventListener('click', () => sendRoomMessage({ type: 'answer', side: 'right' }))
  byId.roomModeClassic.addEventListener('click', () => {
    roomMode = 'classic'
    renderRoomSettings()
    pushRoomSettings()
  })
  byId.roomModeTimed.addEventListener('click', () => {
    roomMode = 'timed'
    renderRoomSettings()
    pushRoomSettings()
  })
  byId.roomLengthInput.addEventListener('change', syncRoomLength)
  byId.roomLengthInput.addEventListener('input', syncRoomLength)
  ;[
    byId.roomMinVotes,
    byId.roomRanking,
    ...Object.values(byId.roomExcludes),
  ].forEach((control) => {
    control.addEventListener('change', () => syncRoomSettings())
    control.addEventListener('input', () => syncRoomSettings())
  })
  ;[byId.roomScoreMin, byId.roomScoreMax].forEach((control) => {
    control.addEventListener('input', () => handleRoomScoreInput(control))
    control.addEventListener('change', commitRoomScores)
    control.addEventListener('blur', commitRoomScores)
    control.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') control.blur()
    })
  })
  ;[byId.roomYearMin, byId.roomYearMax].forEach((control) => {
    control.addEventListener('input', () => handleRoomYearInput(control))
    control.addEventListener('change', () => commitRoomYears({ normalize: true }))
    control.addEventListener('blur', () => commitRoomYears({ normalize: true }))
    control.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') control.blur()
    })
  })
  byId.roomYearButtons.forEach((button) => {
    button.addEventListener('click', () => applyRoomYearRange((button.dataset.roomYearRange ?? 'all') as RoomYearRange))
  })
  byId.roomPresetButtons.forEach((button) => {
    button.addEventListener('click', () => applyRoomPreset((button.dataset.roomPreset ?? 'standard') as PresetName))
  })
  ;[
    byId.minVotes,
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
  ;[byId.scoreMin, byId.scoreMax].forEach((control) => {
    control.addEventListener('input', () => handleScoreInput(control))
    control.addEventListener('change', commitScores)
    control.addEventListener('blur', commitScores)
    control.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') control.blur()
    })
  })
  byId.presetButtons.forEach((button) => {
    button.addEventListener('click', () => applyPreset((button.dataset.preset ?? 'standard') as PresetName))
  })
  window.addEventListener('keydown', handleAnswerShortcut)
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
