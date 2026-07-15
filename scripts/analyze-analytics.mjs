import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

const inputPath = process.argv[2] ? resolve(process.argv[2]) : ''
const outFlag = process.argv.indexOf('--out')
const outputDir = resolve(outFlag >= 0 && process.argv[outFlag + 1]
  ? process.argv[outFlag + 1]
  : join(inputPath ? dirname(inputPath) : process.cwd(), 'analytics-report'))

if (!inputPath) {
  console.error('Usage: npm run analytics:analyze -- <analytics-export.json> [--out <directory>]')
  process.exit(1)
}

const raw = JSON.parse(await readFile(inputPath, 'utf8').then((text) => text.replace(/^\uFEFF/, '')))
if (!raw?.manifest || !raw?.legacy || !raw?.v2 || !Array.isArray(raw.subjects)) {
  throw new Error('Unsupported analytics export: manifest, legacy, v2, or subjects is missing.')
}

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0
const pct = (part, total, digits = 1) => total > 0 ? `${(part / total * 100).toFixed(digits)}%` : '0.0%'
const csvCell = (value) => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

function wilson(success, total, z = 1.96) {
  if (total <= 0) return [0, 0]
  const p = success / total
  const denominator = 1 + z * z / total
  const center = (p + z * z / (2 * total)) / denominator
  const margin = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denominator
  return [Math.max(0, center - margin), Math.min(1, center + margin)]
}

const subjects = new Map(raw.subjects.map((subject) => [`${subject.mediaKind}:${subject.id}`, subject]))
const pairs = new Map()

function addPair(pair) {
  const key = `${pair.mediaKind}:${pair.mode}:${pair.subjectAId}:${pair.subjectBId}`
  const current = pairs.get(key) ?? {
    mediaKind: pair.mediaKind,
    mode: pair.mode,
    subjectAId: number(pair.subjectAId),
    subjectBId: number(pair.subjectBId),
    scoreA: number(pair.scoreA),
    scoreB: number(pair.scoreB),
    shownCount: 0,
    correctCount: 0,
    wrongCount: 0,
    aSelectedCount: 0,
    bSelectedCount: 0,
    scoreDiffBucket: pair.scoreDiffBucket,
  }
  for (const field of ['shownCount', 'correctCount', 'wrongCount', 'aSelectedCount', 'bSelectedCount']) {
    current[field] += number(pair[field])
  }
  current.scoreA = number(pair.scoreA)
  current.scoreB = number(pair.scoreB)
  current.scoreDiffBucket = pair.scoreDiffBucket
  pairs.set(key, current)
}

for (const pair of raw.legacy.pairs ?? []) addPair(pair)
for (const pair of raw.v2.pairs ?? []) {
  addPair({
    mediaKind: pair.media_kind,
    mode: pair.mode,
    subjectAId: pair.subject_a_id,
    subjectBId: pair.subject_b_id,
    scoreA: pair.score_a,
    scoreB: pair.score_b,
    shownCount: pair.shown_count,
    correctCount: pair.correct_count,
    wrongCount: pair.wrong_count,
    aSelectedCount: pair.a_selected_count,
    bSelectedCount: pair.b_selected_count,
    scoreDiffBucket: pair.score_diff_bucket,
  })
}

const analyzedPairs = [...pairs.values()].map((pair) => {
  const subjectA = subjects.get(`${pair.mediaKind}:${pair.subjectAId}`)
  const subjectB = subjects.get(`${pair.mediaKind}:${pair.subjectBId}`)
  const [ciLow, ciHigh] = wilson(pair.correctCount, pair.shownCount)
  return {
    ...pair,
    subjectAName: subjectA?.nameCn || subjectA?.name || `#${pair.subjectAId}`,
    subjectBName: subjectB?.nameCn || subjectB?.name || `#${pair.subjectBId}`,
    accuracy: pair.shownCount > 0 ? pair.correctCount / pair.shownCount : 0,
    ciLow,
    ciHigh,
    smoothedAccuracy: (pair.correctCount + 1) / (pair.shownCount + 2),
  }
})

const reliablePairs = analyzedPairs.filter((pair) => pair.shownCount >= 5)
const hardestPairs = reliablePairs.toSorted((a, b) => a.smoothedAccuracy - b.smoothedAccuracy || b.shownCount - a.shownCount).slice(0, 20)
const mostShownPairs = analyzedPairs.toSorted((a, b) => b.shownCount - a.shownCount).slice(0, 20)
const diffOrder = ['0-0.2', '0.3-0.5', '0.6-1.0', '1.1+']
const diffStats = new Map(diffOrder.map((bucket) => [bucket, { shown: 0, correct: 0 }]))
for (const pair of analyzedPairs) {
  const stats = diffStats.get(pair.scoreDiffBucket) ?? { shown: 0, correct: 0 }
  stats.shown += pair.shownCount
  stats.correct += pair.correctCount
  diffStats.set(pair.scoreDiffBucket, stats)
}

const sourceStats = new Map()
for (const row of raw.v2.gamesDaily ?? []) {
  const source = row.source || 'unknown'
  const stats = sourceStats.get(source) ?? { games: 0, answers: 0, correct: 0 }
  stats.games += number(row.game_count)
  stats.answers += number(row.answer_count)
  stats.correct += number(row.correct_count)
  sourceStats.set(source, stats)
}

const positionStats = { selectedLeft: 0, selectedRight: 0, winnerLeft: 0, winnerRight: 0, shown: 0, correct: 0 }
for (const row of raw.v2.segmentsDaily ?? []) {
  positionStats.selectedLeft += number(row.selected_left_count)
  positionStats.selectedRight += number(row.selected_right_count)
  positionStats.winnerLeft += number(row.winner_left_count)
  positionStats.winnerRight += number(row.winner_right_count)
  positionStats.shown += number(row.shown_count)
  positionStats.correct += number(row.correct_count)
}

const overview = raw.overview
const markdownRows = (headers, rows) => [
  `| ${headers.join(' | ')} |`,
  `| ${headers.map(() => '---').join(' | ')} |`,
  ...rows.map((row) => `| ${row.join(' | ')} |`),
].join('\n')

const mediaLabels = { anime: '动画', manga: '漫画', lightNovel: '轻小说', galgame: 'Galgame' }
const report = `# Rating;Gate 匿名统计分析报告

- 数据文件：${basename(inputPath)}
- 导出时间：${raw.manifest.exportedAt}
- 报告生成时间：${new Date().toISOString()}
- 数据模式：匿名聚合；历史 v1 与 v2 合并

## 数据概况

- 有效赛果：${overview.games.total} 局
- 答题样本：${overview.pairs.totalShown} 题
- 题目组合：${overview.pairs.scannedPairs} 组
- 总体答题正确率：${pct(overview.pairs.totalCorrect, overview.pairs.totalShown)}
- 可进行稳定难度排序的组合（至少 5 次出现）：${reliablePairs.length} 组

## 题库样本结构

${markdownRows(['题库', '局数', '占比'], Object.entries(overview.games.byMediaKind).map(([kind, count]) => [mediaLabels[kind] ?? kind, count, pct(count, overview.games.total)]))}

## 分差与正确率

${markdownRows(['评分分差', '题数', '正确率'], diffOrder.map((bucket) => {
  const stats = diffStats.get(bucket) ?? { shown: 0, correct: 0 }
  return [bucket, stats.shown, pct(stats.correct, stats.shown)]
}))}

## 稳定困难组合

采用 Beta(1,1) 平滑并要求至少出现 5 次；95% 区间使用 Wilson 方法。小样本结果仍应谨慎解释。

${markdownRows(['题目组合', '题库/模式', '出现', '正确率', '95%区间'], hardestPairs.map((pair) => [
  `${pair.subjectAName} vs ${pair.subjectBName}`,
  `${mediaLabels[pair.mediaKind] ?? pair.mediaKind}/${pair.mode}`,
  pair.shownCount,
  pct(pair.correctCount, pair.shownCount),
  `${pct(pair.ciLow, 1)}–${pct(pair.ciHigh, 1)}`,
]))}

## v2 来源与位置检查

${sourceStats.size > 0 ? markdownRows(['来源', '局数', '题数', '正确率'], [...sourceStats].map(([source, stats]) => [source, stats.games, stats.answers, pct(stats.correct, stats.answers)])) : 'v2 尚无来源数据。'}

${positionStats.shown > 0 ? `- 玩家选择左侧：${pct(positionStats.selectedLeft, positionStats.selectedLeft + positionStats.selectedRight)}
- 正确答案位于左侧：${pct(positionStats.winnerLeft, positionStats.winnerLeft + positionStats.winnerRight)}
- v2题目正确率：${pct(positionStats.correct, positionStats.shown)}` : '- v2 尚无左右位置数据。'}

## 数据解释限制

- v1没有日期、单人/联机和左右位置维度，这些字段不会被推测。
- 数据单位是匿名对局，不等于独立用户；不能用于用户留存或个人学习曲线。
- 题目组合由抽题算法产生，不能视为所有可能组合的随机样本。
- Bangumi评分可能随题库更新而变化；v2使用题库版本和评分快照帮助复现。
`

const pairCsvHeaders = [
  'mediaKind', 'mode', 'subjectAId', 'subjectAName', 'subjectBId', 'subjectBName',
  'scoreA', 'scoreB', 'scoreDiffBucket', 'shownCount', 'correctCount', 'wrongCount',
  'accuracy', 'ciLow', 'ciHigh', 'smoothedAccuracy',
]
const pairCsv = [pairCsvHeaders, ...analyzedPairs.map((pair) => [
  pair.mediaKind, pair.mode, pair.subjectAId, pair.subjectAName, pair.subjectBId, pair.subjectBName,
  pair.scoreA, pair.scoreB, pair.scoreDiffBucket, pair.shownCount, pair.correctCount, pair.wrongCount,
  pair.accuracy, pair.ciLow, pair.ciHigh, pair.smoothedAccuracy,
])].map((row) => row.map(csvCell).join(',')).join('\r\n')

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Rating;Gate 统计报告</title><style>
body{font:15px/1.65 system-ui,-apple-system,"Microsoft YaHei",sans-serif;color:#17181d;background:#f5f6f8;margin:0}main{max-width:1080px;margin:32px auto;padding:32px;background:#fff;border-radius:18px;box-shadow:0 14px 40px #1b243012}h1,h2{line-height:1.25}h2{margin-top:32px;border-bottom:1px solid #e5e9ef;padding-bottom:8px}table{width:100%;border-collapse:collapse;margin:14px 0;display:block;overflow:auto}th,td{border:1px solid #e2e6eb;padding:8px 10px;text-align:left;white-space:nowrap}th{background:#f5f6f8}code{background:#f2f3f5;padding:2px 5px;border-radius:4px}.note{color:#6f7480}@media(max-width:700px){main{margin:0;padding:18px;border-radius:0}}
</style></head><body><main><h1>Rating;Gate 匿名统计分析报告</h1><p class="note">导出时间 ${escapeHtml(raw.manifest.exportedAt)} · 报告生成时间 ${new Date().toISOString()}</p>
<h2>数据概况</h2><ul><li>有效赛果：${overview.games.total} 局</li><li>答题样本：${overview.pairs.totalShown} 题</li><li>题目组合：${overview.pairs.scannedPairs} 组</li><li>总体正确率：${pct(overview.pairs.totalCorrect, overview.pairs.totalShown)}</li></ul>
<h2>分差与正确率</h2><table><tr><th>评分分差</th><th>题数</th><th>正确率</th></tr>${diffOrder.map((bucket) => { const s = diffStats.get(bucket); return `<tr><td>${bucket}</td><td>${s?.shown ?? 0}</td><td>${pct(s?.correct ?? 0, s?.shown ?? 0)}</td></tr>` }).join('')}</table>
<h2>稳定困难组合</h2><p class="note">至少出现5次；显示Wilson 95%区间。</p><table><tr><th>题目组合</th><th>题库/模式</th><th>出现</th><th>正确率</th><th>95%区间</th></tr>${hardestPairs.map((pair) => `<tr><td>${escapeHtml(pair.subjectAName)} vs ${escapeHtml(pair.subjectBName)}</td><td>${escapeHtml(mediaLabels[pair.mediaKind] ?? pair.mediaKind)}/${pair.mode}</td><td>${pair.shownCount}</td><td>${pct(pair.correctCount, pair.shownCount)}</td><td>${pct(pair.ciLow, 1)}–${pct(pair.ciHigh, 1)}</td></tr>`).join('')}</table>
<h2>解释限制</h2><ul><li>v1缺少日期、来源和左右位置维度。</li><li>匿名对局不等于独立用户。</li><li>抽题组合不是全部可能组合的随机样本。</li></ul></main></body></html>`

const summary = {
  generatedAt: new Date().toISOString(),
  export: raw.manifest,
  totals: {
    games: overview.games.total,
    answers: overview.pairs.totalShown,
    pairs: overview.pairs.scannedPairs,
    accuracy: overview.pairs.totalShown > 0 ? overview.pairs.totalCorrect / overview.pairs.totalShown : 0,
  },
  diffStats: Object.fromEntries(diffStats),
  sourceStats: Object.fromEntries(sourceStats),
  positionStats,
  hardestPairs,
  mostShownPairs,
}

await mkdir(outputDir, { recursive: true })
await Promise.all([
  writeFile(join(outputDir, 'report.md'), report, 'utf8'),
  writeFile(join(outputDir, 'report.html'), html, 'utf8'),
  writeFile(join(outputDir, 'pair-analysis.csv'), `\uFEFF${pairCsv}`, 'utf8'),
  writeFile(join(outputDir, 'analysis-summary.json'), JSON.stringify(summary, null, 2), 'utf8'),
])

console.log(`Analytics report written to ${outputDir}`)
