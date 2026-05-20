import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const endpoint = 'https://api.bgm.tv/v0/search/subjects?limit=12&offset=0'
const outputPath = resolve('public/anime-seed.json')
const keywords = [
  '攻壳机动队',
  '钢之炼金术师',
  '星际牛仔',
  'CLANNAD',
  '进击的巨人',
  '冰菓',
  '凉宫春日',
  '魔法少女小圆',
  '命运石之门',
  '虫师',
  '来自深渊',
  '孤独摇滚',
  '葬送的芙莉莲',
  '四月是你的谎言',
  '紫罗兰永恒花园',
  '新世纪福音战士',
  '天元突破',
  '京吹',
  '轻音少女',
  '银魂',
  '夏目友人帐',
  '物语系列',
  'Fate',
  '空之境界',
  '千年女优',
  '红辣椒',
  '你的名字',
  '千与千寻',
  '龙猫',
  'JOJO',
  '排球少年',
  '灵能百分百',
  '辉夜大小姐',
  '间谍过家家',
  '赛博朋克',
  '莉可丽丝',
  '吹响',
  '少女终末旅行',
  '宇宙よりも遠い場所',
  'ARIA',
]

function normalize(item) {
  const score = Number(item.rating?.score ?? 0)
  const votes = Number(item.rating?.total ?? 0)
  const image = item.images?.common ?? item.images?.large ?? item.image ?? ''
  if (item.type !== 2 || item.nsfw || score <= 0 || votes < 100 || !image) return null
  return {
    id: item.id,
    name: item.name ?? '',
    nameCn: item.name_cn ?? '',
    score,
    votes,
    rank: item.rating?.rank ?? null,
    date: item.date ?? '',
    image,
    tags: Array.isArray(item.meta_tags) ? item.meta_tags : [],
    platform: item.platform ?? '',
  }
}

async function search(keyword) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'AniScoreArenaPrototype/0.1 (local seed generator)',
    },
    body: JSON.stringify({
      keyword,
      filter: {
        type: [2],
      },
    }),
  })
  if (!response.ok) throw new Error(`${keyword}: HTTP ${response.status}`)
  const payload = await response.json()
  return payload.data.map(normalize).filter(Boolean)
}

const byId = new Map()
for (const keyword of keywords) {
  const rows = await search(keyword)
  for (const row of rows) byId.set(row.id, row)
  await new Promise((resolveTimer) => setTimeout(resolveTimer, 260))
}

const seed = [...byId.values()]
  .filter((item) => item.votes >= 500)
  .sort((a, b) => b.votes - a.votes)
  .slice(0, 180)

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(seed, null, 2)}\n`, 'utf8')

console.log(`Wrote ${seed.length} anime to ${outputPath}`)
